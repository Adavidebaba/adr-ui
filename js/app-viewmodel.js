/**
 * AppViewModel - Gestisce lo stato dell'applicazione, la UI e il flusso dati.
 */
class AppViewModel {
  constructor() {
    this.githubService = new GitHubService();
    this.adrs = [];
    this.activeTag = null;
    this.activeCategory = null;
    this.searchQuery = '';
    this.sortOrder = 'desc'; // 'desc' = più recenti prima, 'asc' = meno recenti prima
    this.toastTimer = null;
  }

  init() {
    this.loadSavedConfig();
    this.bindEvents();
    if (this.githubService.isConfigured()) {
      this.refreshData();
    } else {
      this.openConfigModal();
    }
  }

  loadSavedConfig() {
    const repo = localStorage.getItem('adr_repo') || 'Adavidebaba/adr-vault';
    const path = localStorage.getItem('adr_path') || 'adr';
    const token = localStorage.getItem('adr_token') || '';
    this.githubService.updateConfig({ repo, path, token });
  }

  bindEvents() {
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear-btn');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        if (clearBtn) clearBtn.style.display = this.searchQuery ? 'block' : 'none';
        this.renderList();
      });
    }
  }

  clearSearch() {
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear-btn');
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    this.searchQuery = '';
    this.renderList();
  }

  toggleSort() {
    this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
    const icon = document.getElementById('sort-icon');
    const label = document.getElementById('sort-label');
    if (this.sortOrder === 'desc') {
      if (icon) icon.textContent = '📅 ⬇️';
      if (label) label.textContent = 'Recenti';
    } else {
      if (icon) icon.textContent = '📅 ⬆️';
      if (label) label.textContent = 'Meno recenti';
    }
    this.renderList();
  }

  async refreshData() {
    this.setSyncStatus('Caricamento...', 'busy');
    try {
      const files = await this.githubService.listFiles();
      // Accetta file che terminano con .md o qualsiasi file nella cartella adr escluso README
      const adrFiles = files.filter(f => f.type === 'file' && !f.name.toLowerCase().startsWith('readme'));

      const loadedAdrs = await Promise.all(
        adrFiles.map(async (file) => {
          const fileData = await this.githubService.fetchFile(file.url);
          const { meta, body } = AdrParser.parseFrontmatter(fileData.content, fileData.path);
          return {
            path: fileData.path,
            sha: fileData.sha,
            name: fileData.name,
            raw: fileData.content,
            meta,
            body
          };
        })
      );

      // Ordina le decisioni dalla più recente alla più vecchia
      this.adrs = loadedAdrs.sort((a, b) => (b.meta.date || b.path).localeCompare(a.meta.date || a.path));
      this.setSyncStatus(`${this.adrs.length} decisioni caricate`, 'idle');
      this.renderFilters();
      this.renderList();
      this.showToast('Archivio sincronizzato con successo', 'success');
    } catch (error) {
      console.error(error);
      this.setSyncStatus('Errore di sincronizzazione', 'error');
      this.showToast(error.message, 'error');
    }
  }

  async onTaskCheckChange(adrIndex, taskIndex, isChecked) {
    const adr = this.adrs[adrIndex];
    if (!adr) return;

    this.setSyncStatus('Salvataggio task su GitHub...', 'busy');
    this.showToast('Salvataggio su GitHub in corso...', 'info');

    const updatedRaw = AdrParser.toggleTaskInRaw(adr.raw, taskIndex, isChecked);

    try {
      const newSha = await this.githubService.updateFile(
        adr.path,
        updatedRaw,
        adr.sha,
        `Update task in ${adr.path}`
      );

      // Aggiorna lo stato locale in memoria
      adr.raw = updatedRaw;
      if (newSha) adr.sha = newSha;
      const parsed = AdrParser.parseFrontmatter(updatedRaw, adr.path);
      adr.meta = parsed.meta;
      adr.body = parsed.body;

      this.setSyncStatus('Salvato su GitHub ✓', 'idle');
      this.showToast('Task salvato su GitHub!', 'success');
      this.renderList();
    } catch (err) {
      console.error(err);
      this.setSyncStatus('Errore salvataggio task', 'error');
      this.showToast(`Errore: ${err.message}`, 'error');
      this.renderList(); // Ripristina la visualizzazione precedente
    }
  }

  setFilter(type, value) {
    if (type === 'tag') {
      this.activeTag = this.activeTag === value ? null : value;
    } else if (type === 'category') {
      this.activeCategory = this.activeCategory === value ? null : value;
    }
    this.renderFilters();
    this.renderList();
  }

  resetFilters() {
    this.activeTag = null;
    this.activeCategory = null;
    this.renderFilters();
    this.renderList();
  }

  renderFilters() {
    const container = document.getElementById('filters-bar');
    if (!container) return;

    const allCategories = new Set();
    const allTags = new Set();

    this.adrs.forEach(a => {
      if (a.meta.category) allCategories.add(a.meta.category);
      if (Array.isArray(a.meta.tags)) a.meta.tags.forEach(t => allTags.add(t));
    });

    const isAllActive = !this.activeTag && !this.activeCategory;
    let html = `<button class="chip ${isAllActive ? 'active' : ''}" onclick="window.appViewModel.resetFilters()">Tutti (${this.adrs.length})</button>`;

    allCategories.forEach(cat => {
      const active = this.activeCategory === cat;
      html += `<button class="chip ${active ? 'active' : ''}" onclick="window.appViewModel.setFilter('category', '${cat}')">📁 ${cat}</button>`;
    });

    allTags.forEach(tag => {
      const active = this.activeTag === tag;
      html += `<button class="chip ${active ? 'active' : ''}" onclick="window.appViewModel.setFilter('tag', '${tag}')">#${tag}</button>`;
    });

    container.innerHTML = html;
  }

  renderList() {
    const container = document.getElementById('adr-list-container');
    if (!container) return;

    const sorted = [...this.adrs].sort((a, b) => {
      const dateA = a.meta.date || a.path;
      const dateB = b.meta.date || b.path;
      return this.sortOrder === 'desc'
        ? dateB.localeCompare(dateA)
        : dateA.localeCompare(dateB);
    });

    const filtered = sorted.filter((adr) => {
      const matchCat = !this.activeCategory || adr.meta.category === this.activeCategory;
      const matchTag = !this.activeTag || (adr.meta.tags && adr.meta.tags.includes(this.activeTag));
      const matchQuery = !this.searchQuery || 
        adr.raw.toLowerCase().includes(this.searchQuery) ||
        (adr.meta.title && adr.meta.title.toLowerCase().includes(this.searchQuery));
      return matchCat && matchTag && matchQuery;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p style="font-size: 1.5rem; margin-bottom: 0.5rem;">🔍</p>
          <p>Nessuna decisione trovata per i filtri selezionati.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map((adr) => {
      const originalIndex = this.adrs.indexOf(adr);
      const stats = AdrParser.getTaskStats(adr.raw);
      const isComplete = stats.total > 0 && stats.completed === stats.total;
      const badgeClass = isComplete ? 'task-badge-done' : 'task-badge-pending';
      const renderedBody = AdrParser.renderMarkdownWithInteractiveTasks(adr.body, originalIndex);
      const editUrl = `https://github.com/${this.githubService.repo}/edit/main/${adr.path}`;

      return `
        <details class="adr-card">
          <summary class="adr-summary">
            <div class="adr-meta-row">
              <div class="adr-meta-left">
                <span class="meta-date">${adr.meta.date || ''}</span>
                ${adr.meta.category ? `<span class="meta-category">${adr.meta.category}</span>` : ''}
              </div>
              ${stats.total > 0 ? `
                <span class="task-progress-badge ${badgeClass}">
                  ${isComplete ? '✓' : '⏳'} Task: ${stats.completed}/${stats.total}
                </span>
              ` : ''}
            </div>
            <h2 class="adr-title">${adr.meta.title || adr.name}</h2>
            <div class="adr-tags-row">
              ${(adr.meta.tags || []).map(t => `<span class="tag-badge">#${t}</span>`).join('')}
            </div>
          </summary>
          <div class="adr-body">
            ${renderedBody}
            <div class="adr-footer">
              <a href="${editUrl}" target="_blank" rel="noopener noreferrer" class="btn-github-edit" title="Modifica questo file direttamente su GitHub">
                ✏️ Modifica su GitHub
              </a>
            </div>
          </div>
        </details>
      `;
    }).join('');
  }

  setSyncStatus(text, state) {
    const label = document.getElementById('sync-label');
    const dot = document.getElementById('sync-dot');
    if (label) label.textContent = text;
    if (dot) {
      dot.className = 'sync-dot';
      if (state === 'busy') dot.classList.add('busy');
      if (state === 'error') dot.classList.add('error');
    }
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast toast-${type} show`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  openConfigModal() {
    const modal = document.getElementById('config-modal');
    if (modal) {
      document.getElementById('input-repo').value = this.githubService.repo;
      document.getElementById('input-path').value = this.githubService.path;
      document.getElementById('input-token').value = this.githubService.token;
      modal.classList.add('open');
    }
  }

  closeConfigModal() {
    const modal = document.getElementById('config-modal');
    if (modal) modal.classList.remove('open');
  }

  saveConfigFromModal() {
    const repo = document.getElementById('input-repo').value.trim();
    const path = document.getElementById('input-path').value.trim().replace(/^\/|\/$/g, '');
    const token = document.getElementById('input-token').value.trim();

    localStorage.setItem('adr_repo', repo);
    localStorage.setItem('adr_path', path);
    localStorage.setItem('adr_token', token);

    this.githubService.updateConfig({ repo, path, token });
    this.closeConfigModal();
    this.refreshData();
  }
}

window.appViewModel = new AppViewModel();
document.addEventListener('DOMContentLoaded', () => window.appViewModel.init());
