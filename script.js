/*
 * Lightweight in-page navigation for internal .html links.
 * Keeps the sidebar in place and swaps only the article content.
 */
(function () {
	var ARTICLE_SELECTOR = "#main article.page";
	var pageCache = new Map();
	var inFlight = new Map();

	function normalizedPath(url) {
		var resolved = new URL(url, window.location.href);
		return resolved.pathname + resolved.search;
	}

	function isInternalHtmlPage(url) {
		return url.origin === window.location.origin && (url.pathname.endsWith(".html") || url.pathname === "/");
	}

	function shouldHandleLink(link, event) {
		if (!link || event.defaultPrevented) return false;
		if (event.button !== 0) return false;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
		if (link.target && link.target !== "_self") return false;
		if (link.hasAttribute("download")) return false;

		var href = link.getAttribute("href");
		if (!href || href.startsWith("#")) return false;

		var url = new URL(href, window.location.href);
		if (!isInternalHtmlPage(url)) return false;

		if (normalizedPath(url.href) === normalizedPath(window.location.href)) return false;

		return true;
	}

	function parseArticle(htmlText) {
		var parser = new DOMParser();
		var doc = parser.parseFromString(htmlText, "text/html");
		var article = doc.querySelector(ARTICLE_SELECTOR);

		return {
			title: doc.title,
			articleHtml: article ? article.outerHTML : ""
		};
	}

	function seedCurrentPage() {
		var currentArticle = document.querySelector(ARTICLE_SELECTOR);
		if (!currentArticle) return;

		pageCache.set(normalizedPath(window.location.href), {
			title: document.title,
			articleHtml: currentArticle.outerHTML
		});
	}

	function loadPage(url) {
		var key = normalizedPath(url);

		if (pageCache.has(key)) {
			return Promise.resolve(pageCache.get(key));
		}

		if (inFlight.has(key)) {
			return inFlight.get(key);
		}

		var request = fetch(url, { credentials: "same-origin" })
			.then(function (response) {
				if (!response.ok) throw new Error("Failed to load page");
				return response.text();
			})
			.then(function (htmlText) {
				var parsed = parseArticle(htmlText);
				if (!parsed.articleHtml) throw new Error("Article region missing");

				pageCache.set(key, parsed);
				return parsed;
			})
			.finally(function () {
				inFlight.delete(key);
			});

		inFlight.set(key, request);
		return request;
	}

	function renderArticle(pageData) {
		var currentArticle = document.querySelector(ARTICLE_SELECTOR);
		if (!currentArticle) return false;

		var wrapper = document.createElement("div");
		wrapper.innerHTML = pageData.articleHtml;
		var nextArticle = wrapper.firstElementChild;
		if (!nextArticle) return false;

		currentArticle.replaceWith(nextArticle);
		document.title = pageData.title || document.title;
		return true;
	}

	function swapPage(url, pushState) {
		loadPage(url)
			.then(function (pageData) {
				var replaced = renderArticle(pageData);
				if (!replaced) {
					window.location.href = url;
					return;
				}

				if (pushState) {
					window.history.pushState({ path: url }, "", url);
				}

				window.scrollTo({ top: 0, behavior: "auto" });
			})
			.catch(function () {
				window.location.href = url;
			});
	}

	function prefetch(url) {
		var resolved = new URL(url, window.location.href);
		if (!isInternalHtmlPage(resolved)) return;
		if (normalizedPath(resolved.href) === normalizedPath(window.location.href)) return;

		loadPage(resolved.href).catch(function () {
			/* Ignore prefetch failures; normal navigation fallback still works. */
		});
	}

	seedCurrentPage();

	document.addEventListener("click", function (event) {
		var link = event.target.closest("a");
		if (!shouldHandleLink(link, event)) return;

		event.preventDefault();
		swapPage(link.href, true);
	});

	document.addEventListener(
		"mouseenter",
		function (event) {
			var link = event.target.closest("a");
			if (!link) return;
			prefetch(link.href);
		},
		true
	);

	document.addEventListener(
		"touchstart",
		function (event) {
			var link = event.target.closest("a");
			if (!link) return;
			prefetch(link.href);
		},
		{ passive: true, capture: true }
	);

	window.addEventListener("popstate", function () {
		swapPage(window.location.href, false);
	});
})();
