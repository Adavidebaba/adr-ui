/**
 * AdrParser - Responsabile del parsing dei metadati YAML e del parsing di Markdown con checkbox interattive.
 */
class AdrParser {
  // Estrae il frontmatter YAML e separa il body Markdown
  static parseFrontmatter(rawContent, defaultPath) {
    const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    const meta = {
      title: defaultPath.replace(/\.md$/, '').split('/').pop(),
      date: '',
      category: 'Generale',
      tags: [],
      status: 'accettata',
      slug: ''
    };

    if (!match) {
      return { meta, body: rawContent };
    }

    const yamlBlock = match[1];
    const body = match[2];

    const titleMatch = yamlBlock.match(/title:\s*["']?([^"'\n\r]+)["']?/);
    const dateMatch = yamlBlock.match(/date:\s*["']?([^"'\n\r]+)["']?/);
    const catMatch = yamlBlock.match(/category:\s*["']?([^"'\n\r]+)["']?/);
    const statusMatch = yamlBlock.match(/status:\s*["']?([^"'\n\r]+)["']?/);
    const slugMatch = yamlBlock.match(/slug:\s*["']?([^"'\n\r]+)["']?/);
    const tagsMatch = yamlBlock.match(/tags:\s*\[([^\]]+)\]/);

    if (titleMatch) meta.title = titleMatch[1].trim();
    if (dateMatch) meta.date = dateMatch[1].trim();
    if (catMatch) meta.category = catMatch[1].trim();
    if (statusMatch) meta.status = statusMatch[1].trim();
    if (slugMatch) meta.slug = slugMatch[1].trim();
    if (tagsMatch) {
      meta.tags = tagsMatch[1]
        .split(',')
        .map(t => t.trim().replace(/['"]/g, ''))
        .filter(Boolean);
    }

    return { meta, body };
  }

  // Calcola il numero di task totali e completati nel testo raw
  static getTaskStats(rawContent) {
    const tasks = [...rawContent.matchAll(/^\s*-\s*\[([ xX])\]\s*(.*)$/gm)];
    const total = tasks.length;
    const completed = tasks.filter(m => m[1].toLowerCase() === 'x').length;
    return { total, completed };
  }

  // Sostituisce lo stato di una specifica checkbox all'interno del contenuto raw
  static toggleTaskInRaw(rawContent, targetTaskIndex, isChecked) {
    let currentIndex = 0;
    return rawContent.replace(/^(\s*-\s*\[)([ xX])(\]\s*.*)$/gm, (fullMatch, prefix, oldState, suffix) => {
      if (currentIndex++ === targetTaskIndex) {
        return `${prefix}${isChecked ? 'x' : ' '}${suffix}`;
      }
      return fullMatch;
    });
  }

  // Converte il corpo Markdown in HTML con checkbox interattive
  static renderMarkdownWithInteractiveTasks(body, adrIndex) {
    if (typeof marked === 'undefined') return body;

    // Rimuove eventuale primo titolo H1 duplicato nel body
    const cleanBody = body.replace(/^\s*#\s+[^\n\r]+\r?\n/, '');
    let html = marked.parse(cleanBody);

    let taskIndex = 0;
    // Sostituisce i tag <input type="checkbox"> generati da marked con elementi interattivi
    html = html.replace(/<input(?:\s+checked(?:="")?)?(?:\s+disabled(?:="")?)?\s+type="checkbox"(?:\s+disabled(?:="")?)?(?:\s+checked(?:="")?)?>/gi, (match) => {
      const isChecked = match.toLowerCase().includes('checked');
      const currentIdx = taskIndex++;
      const checkedAttr = isChecked ? 'checked' : '';
      return `<input type="checkbox" ${checkedAttr} class="task-checkbox" data-adr-index="${adrIndex}" data-task-index="${currentIdx}" onchange="window.appViewModel.onTaskCheckChange(${adrIndex}, ${currentIdx}, this.checked)">`;
    });

    return html;
  }
}

window.AdrParser = AdrParser;
