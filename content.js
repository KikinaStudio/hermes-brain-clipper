(() => {
  const MAX_CHARS = 50000;

  const clone = document.cloneNode(true);
  const article = new Readability(clone).parse();

  if (!article) {
    return { error: "Could not extract page content" };
  }

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced"
  });

  // Strip link URLs to save tokens -- only the page source URL matters
  turndown.addRule("stripLinks", {
    filter: "a",
    replacement: (content) => content
  });

  // Strip images to save tokens
  turndown.addRule("stripImages", {
    filter: "img",
    replacement: () => ""
  });

  let markdown = turndown.turndown(article.content);

  if (markdown.length > MAX_CHARS) {
    markdown = markdown.substring(0, MAX_CHARS) + "\n\n[...truncated at 50000 characters]";
  }

  return {
    title: article.title || document.title,
    url: location.href,
    markdown
  };
})();
