/**
 * Wrapper sobre DOMPurify para sanitizar HTML antes de insertar en el DOM.
 *
 * Uso:
 *   import { sanitizeHtml } from '../utils/sanitize';
 *   <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
 *
 * Configuración:
 *   - ALLOWED_TAGS: etiquetas permitidas (formato de texto básico + links)
 *   - ALLOWED_ATTR: atributos seguros (href, target, class, style básico)
 *   - FORBID_SCRIPTS: siempre true — no se permite <script> ni event handlers
 */
import DOMPurify from 'dompurify';

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'b', 'i', 'em', 'strong', 'u', 's', 'br', 'p',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'title'],
  ALLOW_DATA_ATTR: false,
  FORBID_SCRIPTS: true,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
  // Fuerza links externos a abrirse en pestaña nueva con noopener
  ADD_ATTR: ['target'],
};

// Agrega rel="noopener noreferrer" a todos los links externos
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Sanitiza HTML y devuelve string seguro para dangerouslySetInnerHTML.
 * @param {string|null|undefined} html - HTML crudo (de Brightspace, AI, etc.)
 * @returns {string} HTML sanitizado
 */
export function sanitizeHtml(html) {
  if (!html) return '';
  return DOMPurify.sanitize(String(html), PURIFY_CONFIG);
}
