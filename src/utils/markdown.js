const { marked } = require('marked');
const DOMPurify = require('isomorphic-dompurify');

marked.setOptions({ gfm: true, breaks: true });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
        node.setAttribute('rel', 'nofollow noopener ugc');
        const href = node.getAttribute('href') || '';
        if (/^javascript:/i.test(href)) node.removeAttribute('href');
    }
});

const PURIFY_CONFIG = {
    ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','hr','blockquote','ul','ol','li','strong','em','del','code','pre','a','img','table','thead','tbody','tr','th','td'],
    ALLOWED_ATTR: ['href','src','alt','title','class','lang'],
    FORBID_TAGS: ['script','iframe','object','embed','form','style','svg','math'],
    FORBID_ATTR: ['style','onerror','onclick','onload','onmouseover','onfocus','onblur']
};

function renderMarkdown(content) {
    const raw = marked.parse(content || '');
    return DOMPurify.sanitize(raw, PURIFY_CONFIG);
}

function renderExcerpt(content) {
    return content.replace(/[#*`>\-\[\]]/g, '').slice(0, 150) + '...';
}

module.exports = { renderMarkdown, renderExcerpt };
