/**
 * Page translators rewrite text nodes React still owns. Google Translate swaps
 * a text node for `<font><font>translated</font></font>` and drops the
 * original; Yandex wraps text in `<ya-tr-span>`. React keeps the original text
 * node as its sibling reference, so the next icon swap calls
 * `button.insertBefore(icon, textNode)` with a node that's no longer a child
 * of the button, the DOM throws NotFoundError, and the error boundary replaces
 * the whole page (#4685, facebook/react#11538).
 *
 * The guard patches `Node.prototype.insertBefore` and `removeChild` once, at
 * startup, and only steps in when the call would throw and a translator left
 * its mark: the node sits inside a translator wrapper under the parent, or it
 * is detached while the parent (or `<html>`) shows translator markup. Every
 * other call, including a mismatch with no translator involved, goes straight
 * to the original method so a real reconciliation bug still throws. Dev builds
 * log each fallback for the same reason.
 */

const INSTALLED = Symbol.for("snapotter.translatorDomGuard");
const TRANSLATOR_TAGS = new Set(["font", "ya-tr-span"]);
// Google Translate's classes on <html> while a page is translated.
const TRANSLATED_HTML_CLASSES = ["translated-ltr", "translated-rtl"];

function isTranslatorWrapper(node: Node): boolean {
  return TRANSLATOR_TAGS.has(node.nodeName.toLowerCase());
}

/**
 * The direct child of `parent` that holds `node`, when a translator wrapper
 * sits somewhere between them; otherwise null.
 */
function wrappingChildOf(parent: Node, node: Node): Node | null {
  let child: Node = node;
  let current = node.parentNode;
  let wrapped = false;
  while (current && current !== parent) {
    if (isTranslatorWrapper(current)) wrapped = true;
    child = current;
    current = current.parentNode;
  }
  return current === parent && wrapped ? child : null;
}

function showsTranslatorMark(parent: Node): boolean {
  const html = parent.ownerDocument?.documentElement;
  if (html && TRANSLATED_HTML_CLASSES.some((name) => html.classList.contains(name))) return true;
  for (const child of Array.from(parent.childNodes)) {
    if (isTranslatorWrapper(child)) return true;
  }
  return false;
}

function warnFallback(method: string, node: Node, parent: Node): void {
  if (import.meta.env.DEV) {
    console.warn(
      `[translator-dom-guard] ${method} fallback: the node is not a child of this parent. ` +
        "Expected only with a page translator active; otherwise this is a React reconciliation bug.",
      { node, parent },
    );
  }
}

export function installTranslatorDomGuard(): void {
  if (typeof Node !== "function") return;
  const proto = Node.prototype as Node & { [INSTALLED]?: true };
  if (proto[INSTALLED]) return;
  proto[INSTALLED] = true;

  const originalInsertBefore = proto.insertBefore;
  const originalRemoveChild = proto.removeChild;

  proto.insertBefore = function insertBefore<T extends Node>(
    this: Node,
    node: T,
    child: Node | null,
  ): T {
    if (child && child.parentNode !== this) {
      const holder = wrappingChildOf(this, child);
      if (holder) {
        warnFallback("insertBefore", child, this);
        return originalInsertBefore.call(this, node, holder) as T;
      }
      if (child.parentNode === null && showsTranslatorMark(this)) {
        // The reference is gone, so its position is unknown: append.
        warnFallback("insertBefore", child, this);
        return originalInsertBefore.call(this, node, null) as T;
      }
    }
    return originalInsertBefore.call(this, node, child) as T;
  };

  proto.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      const realParent = child.parentNode;
      if (realParent && wrappingChildOf(this, child)) {
        warnFallback("removeChild", child, this);
        return originalRemoveChild.call(realParent, child) as T;
      }
      if (realParent === null && showsTranslatorMark(this)) {
        // The translator already took it out of the document.
        warnFallback("removeChild", child, this);
        return child;
      }
    }
    return originalRemoveChild.call(this, child) as T;
  };
}
