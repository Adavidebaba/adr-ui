/**
 * GitHubService - Gestisce la comunicazione con le GitHub REST API.
 * Responsabilità: Fetch file, aggiornamento contenuti e gestione codifica UTF-8 / Base64.
 */
class GitHubService {
  constructor(config = {}) {
    this.repo = config.repo || '';
    this.path = config.path || 'adr';
    this.token = config.token || '';
  }

  updateConfig(config) {
    this.repo = config.repo || this.repo;
    this.path = config.path || this.path;
    this.token = config.token || this.token;
  }

  isConfigured() {
    return Boolean(this.repo && this.token);
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };
  }

  // Decodifica UTF-8 sicura da Base64 (supporta caratteri speciali, accenti ed emoji)
  static base64ToUtf8(str) {
    const cleanStr = str.replace(/\s/g, '');
    const binary = atob(cleanStr);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  // Codifica UTF-8 sicura in Base64
  static utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Recupera l'elenco dei file nella directory specificata
  async listFiles() {
    if (!this.isConfigured()) throw new Error('Configurazione mancante');
    const url = `https://api.github.com/repos/${this.repo}/contents/${this.path}`;
    const response = await fetch(url, { headers: this.getHeaders() });
    if (!response.ok) {
      throw new Error(`Errore HTTP ${response.status}: impossibile leggere la cartella`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  // Scarica il contenuto di un file specifico tramite il suo url
  async fetchFile(fileUrl) {
    const response = await fetch(fileUrl, { headers: this.getHeaders() });
    if (!response.ok) {
      throw new Error(`Errore HTTP ${response.status}: impossibile scaricare il file`);
    }
    const data = await response.json();
    return {
      sha: data.sha,
      path: data.path,
      name: data.name,
      content: GitHubService.base64ToUtf8(data.content)
    };
  }

  // Aggiorna un file su GitHub effettuando un commit automatico
  async updateFile(filePath, rawContent, currentSha, commitMessage) {
    const url = `https://api.github.com/repos/${this.repo}/contents/${filePath}`;
    const payload = {
      message: commitMessage || `Update ${filePath}`,
      content: GitHubService.utf8ToBase64(rawContent),
      sha: currentSha
    };

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Errore HTTP ${response.status}`);
    }

    const result = await response.json();
    return result.content ? result.content.sha : null;
  }
}

window.GitHubService = GitHubService;
