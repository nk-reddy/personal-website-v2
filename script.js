/*
 * Lightweight in-page navigation for internal .html links.
 * Keeps the sidebar in place and swaps only the article content.
 */
(function () {
	var ARTICLE_SELECTOR = "#main article.page";
	var MAIN_SELECTOR = "#main";
	var READING_PATH = "/reading.html";
	var WRITING_PATH = "/writing.html";
	var WRITING_POST_PATH = "/writing-post.html";
	var READING_LIST_JS_FILE = "reading-list.js";
	var READING_LIST_GLOBAL = "__readingListText";
	var WRITING_LIST_JS_FILE = "writing-list.js";
	var WRITING_LIST_GLOBAL = "__writingListText";
	var WRITING_ARTICLES_DIR = "writing-articles";
	var DEFAULT_READING_SECTIONS = ["planned", "wip", "in progress", "read"];
	var pageCache = new Map();
	var inFlight = new Map();
	var readingLoadPromise = null;
	var writingLoadPromise = null;
	var THEME_STORAGE_KEY = "personal-website-theme";

	function storedTheme() {
		try {
			return window.localStorage.getItem(THEME_STORAGE_KEY);
		} catch (error) {
			return null;
		}
	}

	function rememberTheme(theme) {
		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, theme);
		} catch (error) {
			/* Storage unavailable; the toggle still works for this page view. */
		}
	}

	function preferredTheme() {
		var theme = storedTheme();
		if (theme === "light" || theme === "dark") return theme;

		return "light";
	}

	function applyTheme(theme) {
		document.documentElement.dataset.theme = theme;

		document.querySelectorAll(".theme-toggle").forEach(function (button) {
			var darkMode = theme === "dark";
			button.textContent = darkMode ? "light" : "dark";
			button.setAttribute("aria-pressed", String(darkMode));
			button.setAttribute("aria-label", darkMode ? "Switch to light mode" : "Switch to dark mode");
			button.setAttribute("title", darkMode ? "Switch to light mode" : "Switch to dark mode");
		});
	}

	function initializeTheme() {
		applyTheme(preferredTheme());

		document.addEventListener("click", function (event) {
			var toggle = event.target.closest(".theme-toggle");
			if (!toggle) return;

			var nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
			rememberTheme(nextTheme);
			applyTheme(nextTheme);
		});
	}

	var NAV_MOBILE_QUERY = "(max-width: 48em)";
	var navItems = null;

	/*
	 * The theme's greedy-nav collapses links one at a time as the bar runs out of
	 * room, which on a phone left the masthead half-collapsed: brand + "Reading"
	 * in the bar and only "Writing" in the dropdown. Drive the split off the
	 * breakpoint instead -- on mobile every page link lives in the dropdown, on
	 * desktop they all sit in the bar. main.min.js loads first, so this resize
	 * handler runs after greedy-nav's and gets the final say on the arrangement.
	 */
	function layoutNav() {
		var visibleLinks = document.querySelector("#site-nav .visible-links");
		var hiddenLinks = document.querySelector("#site-nav .hidden-links");
		var navButton = document.querySelector("#site-nav > button");
		if (!visibleLinks || !hiddenLinks || !navButton) return;

		if (!navItems) {
			// greedy-nav has already run by now, and it collapses links by moving the
			// last visible item to the front of the dropdown -- so the dropdown always
			// holds the tail of the original list, in order. Concatenating the two
			// lists recovers the authored order regardless of how much it collapsed.
			navItems = Array.prototype.slice
				.call(visibleLinks.children)
				.concat(Array.prototype.slice.call(hiddenLinks.children));
		}

		var mobile = window.matchMedia(NAV_MOBILE_QUERY).matches;

		navItems.forEach(function (item, index) {
			// Index 0 is the site title; it stays in the bar as the home link.
			var target = mobile && index > 0 ? hiddenLinks : visibleLinks;
			// Append unconditionally rather than only when the parent changes:
			// greedy-nav collapses links by prepending them, so an item can be in
			// the right list in the wrong order. Re-appending in index order fixes
			// placement and order in one pass.
			target.appendChild(item);
		});

		navButton.classList.toggle("hidden", !mobile);
		if (!mobile) closeNavMenu();
	}

	function closeNavMenu() {
		var hiddenLinks = document.querySelector("#site-nav .hidden-links");
		var navButton = document.querySelector("#site-nav > button");
		if (hiddenLinks) hiddenLinks.classList.add("hidden");
		if (navButton) navButton.classList.remove("close");
	}

	function initializeNav() {
		layoutNav();
		window.addEventListener("resize", layoutNav);

		// Dismiss the dropdown once a link in it is taken (navigation is in-page,
		// so nothing else would close the menu).
		document.addEventListener("click", function (event) {
			if (event.target.closest("#site-nav .hidden-links a")) closeNavMenu();
		});
	}

	function normalizedPath(url) {
		var resolved = new URL(url, window.location.href);
		return resolved.pathname + resolved.search;
	}

	function isInternalHtmlPage(url) {
		return url.origin === window.location.origin && (url.pathname.endsWith(".html") || url.pathname === "/");
	}

	function isReadingPath(url) {
		var resolved = new URL(url, window.location.href);
		return resolved.pathname === READING_PATH || resolved.pathname.endsWith("/reading.html") || resolved.pathname.endsWith("reading.html");
	}

	function isWritingPath(url) {
		var resolved = new URL(url, window.location.href);
		return resolved.pathname === WRITING_PATH || resolved.pathname.endsWith("/writing.html") || resolved.pathname.endsWith("writing.html");
	}

	function isWritingPostPath(url) {
		var resolved = new URL(url, window.location.href);
		return resolved.pathname === WRITING_POST_PATH || resolved.pathname.endsWith("/writing-post.html") || resolved.pathname.endsWith("writing-post.html");
	}

	function updateLayoutState(url) {
		var main = document.querySelector(MAIN_SELECTOR);
		if (!main) return;

		if (isReadingPath(url)) {
			main.classList.add("layout-reading");
		} else {
			main.classList.remove("layout-reading");
		}

		if (isWritingPath(url) || isWritingPostPath(url)) {
			main.classList.add("layout-writing");
		} else {
			main.classList.remove("layout-writing");
		}
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

	function parseReadingList(text) {
		var sections = new Map();
		var current = "read";

		text.split(/\r?\n/).forEach(function (line) {
			var trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) return;

			var sectionMatch = trimmed.match(/^\[+\s*(.+?)\s*\]+$/);
			if (sectionMatch) {
				current = normalizeSectionName(sectionMatch[1]);
				if (!sections.has(current)) sections.set(current, []);
				return;
			}

			if (!sections.has(current)) sections.set(current, []);
			sections.get(current).push(trimmed);
		});

		return sections;
	}

	function normalizeSectionName(name) {
		return name.toLowerCase().trim().replace(/^\[+|\]+$/g, "");
	}

	function loadReadingEntries() {
		if (readingLoadPromise) return readingLoadPromise;

		readingLoadPromise = loadReadingEntriesFromJsFile()
			.finally(function () {
				readingLoadPromise = null;
			});

		return readingLoadPromise;
	}

	function loadReadingEntriesFromJsFile() {
		return new Promise(function (resolve, reject) {
			var existing = document.querySelector('script[data-reading-list="true"]');
			if (existing) {
				existing.remove();
			}

			delete window[READING_LIST_GLOBAL];

			var script = document.createElement("script");
			script.src = READING_LIST_JS_FILE + "?v=" + Date.now();
			script.async = true;
			script.dataset.readingList = "true";

			script.onload = function () {
				if (typeof window[READING_LIST_GLOBAL] !== "string") {
					reject(new Error("Reading list JS did not provide data"));
					return;
				}

				resolve(parseReadingList(window[READING_LIST_GLOBAL]));
			};

			script.onerror = function () {
				reject(new Error("Failed to load reading-list.js"));
			};

			document.head.appendChild(script);
		});
	}

	function loadWritingEntries() {
		if (writingLoadPromise) return writingLoadPromise;

		writingLoadPromise = loadWritingEntriesFromJsFile()
			.finally(function () {
				writingLoadPromise = null;
			});

		return writingLoadPromise;
	}

	function loadWritingEntriesFromJsFile() {
		return new Promise(function (resolve, reject) {
			var existing = document.querySelector('script[data-writing-list="true"]');
			if (existing) {
				existing.remove();
			}

			delete window[WRITING_LIST_GLOBAL];

			var script = document.createElement("script");
			script.src = WRITING_LIST_JS_FILE + "?v=" + Date.now();
			script.async = true;
			script.dataset.writingList = "true";

			script.onload = function () {
				if (typeof window[WRITING_LIST_GLOBAL] !== "string") {
					reject(new Error("Writing list JS did not provide data"));
					return;
				}

				resolve(parseWritingList(window[WRITING_LIST_GLOBAL]));
			};

			script.onerror = function () {
				reject(new Error("Failed to load writing-list.js"));
			};

			document.head.appendChild(script);
		});
	}

	function parseWritingList(text) {
		var groups = new Map();
		var currentYear = "";

		function addToGroup(yearKey, entry) {
			if (!groups.has(yearKey)) groups.set(yearKey, []);
			groups.get(yearKey).push(entry);
		}

		text.split(/\r?\n/).forEach(function (line) {
			var trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) return;

			var sectionMatch = trimmed.match(/^\[+\s*(.+?)\s*\]+$/);
			if (sectionMatch) {
				var sectionYear = normalizeWritingYear(sectionMatch[1]);
				if (sectionYear) {
					currentYear = sectionYear;
					if (!groups.has(currentYear)) groups.set(currentYear, []);
					return;
				}
			}

			var bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
			var entryText = bulletMatch ? bulletMatch[1].trim() : trimmed;

			var inlineYear = extractWritingYear(entryText);
			if (inlineYear) {
				addToGroup(inlineYear.year, inlineYear.entry);
				return;
			}

			if (currentYear) {
				addToGroup(currentYear, entryText);
			} else {
				addToGroup("other", entryText);
			}
		});

		return groups;
	}

	function normalizeWritingYear(value) {
		var token = value.trim();

		if (/^\d{4}$/.test(token)) return token;

		var shortYear = token.match(/^'(\d{2})$/);
		if (shortYear) return "20" + shortYear[1];

		return "";
	}

	function extractWritingYear(entry) {
		var bracketed = entry.match(/^\[(\d{4}|'\d{2})\]\s+(.+)$/);
		if (bracketed) {
			var y1 = normalizeWritingYear(bracketed[1]);
			if (y1) return { year: y1, entry: bracketed[2].trim() };
		}

		var prefixed = entry.match(/^(\d{4}|'\d{2})\s*[|:-]\s+(.+)$/);
		if (prefixed) {
			var y2 = normalizeWritingYear(prefixed[1]);
			if (y2) return { year: y2, entry: prefixed[2].trim() };
		}

		return null;
	}

	function slugToTitle(slug) {
		return slug
			.split("-")
			.map(function (part) {
				if (!part) return part;
				return part.charAt(0).toUpperCase() + part.slice(1);
			})
			.join(" ");
	}

	function parseWritingArticle(text, fallbackSlug) {
		var lines = text.split(/\r?\n/);
		var title = "";
		var date = "";
		var bodyStart = 0;

		for (var i = 0; i < lines.length; i++) {
			var line = lines[i].trim();
			if (!line) {
				bodyStart = i + 1;
				break;
			}

			var titleMatch = line.match(/^Title:\s*(.+)$/i);
			if (titleMatch) {
				title = titleMatch[1].trim();
				continue;
			}

			var dateMatch = line.match(/^Date:\s*(.+)$/i);
			if (dateMatch) {
				date = dateMatch[1].trim();
				continue;
			}

			bodyStart = i;
			break;
		}

		if (!title) {
			title = fallbackSlug ? slugToTitle(fallbackSlug) : "Writing";
		}

		var bodyLines = lines.slice(bodyStart);
		var blocks = [];
		var current = [];

		bodyLines.forEach(function (line) {
			if (!line.trim()) {
				if (current.length) {
					blocks.push(current.join(" ").trim());
					current = [];
				}
				return;
			}

			current.push(line.trim());
		});

		if (current.length) {
			blocks.push(current.join(" ").trim());
		}

		return { title: title, date: date, blocks: blocks };
	}

	function renderWritingArticle(article) {
		var metaNode = document.getElementById("writing-article-meta");
		var bodyNode = document.getElementById("writing-article-body");

		if (!metaNode || !bodyNode) return;

		metaNode.textContent = article.date || "";
		bodyNode.innerHTML = "";

		var title = document.createElement("h2");
		title.className = "writing-article-title";
		title.setAttribute("itemprop", "headline");
		title.textContent = article.title;
		bodyNode.appendChild(title);

		if (!article.blocks.length) {
			var empty = document.createElement("p");
			empty.textContent = "Coming soon.";
			bodyNode.appendChild(empty);
			return;
		}

		article.blocks.forEach(function (block) {
			var p = document.createElement("p");
			p.textContent = block;
			bodyNode.appendChild(p);
		});
	}

	function loadWritingPost() {
		var url = new URL(window.location.href);
		var slug = (url.searchParams.get("post") || "").trim();

		if (!slug) {
			renderWritingArticle({
				title: "Missing post",
				date: "",
				blocks: ["Add ?post=<slug> to the writing-post.html URL."]
			});
			return;
		}

		var articlePath = "./" + WRITING_ARTICLES_DIR + "/" + slug + ".txt";
		fetch(articlePath, { cache: "no-store" })
			.then(function (response) {
				if (!response.ok) throw new Error("Failed to load writing article");
				return response.text();
			})
			.then(function (text) {
				var parsed = parseWritingArticle(text, slug);
				renderWritingArticle(parsed);
				document.title = parsed.title + " - Nikhil Reddy";
			})
			.catch(function () {
				renderWritingArticle({
					title: "Article not found",
					date: "",
					blocks: ["Could not load writing-articles/" + slug + ".txt"]
				});
			});
	}

	function orderedSectionNames(sections) {
		var names = [];

		DEFAULT_READING_SECTIONS.forEach(function (name) {
			if (sections.has(name) && sections.get(name).length) names.push(name);
		});

		sections.forEach(function (items, name) {
			if (names.indexOf(name) === -1 && items.length) names.push(name);
		});

		return names;
	}

	function sectionDisplayName(name) {
		return "[" + name + "]";
	}

	function parseReadingEntry(entry) {
		var markdownMatch = entry.match(/^\[(.+)\]\(([^\s)]+)\)$/i);
		if (markdownMatch) {
			return {
				label: markdownMatch[1].trim(),
				url: markdownMatch[2].trim()
			};
		}

		var pipeIndex = entry.lastIndexOf("|");
		if (pipeIndex > 0) {
			var label = entry.slice(0, pipeIndex).trim();
			var url = entry.slice(pipeIndex + 1).trim();
			if (label && url) {
				return { label: label, url: url };
			}
		}

		if (/^(https?:\/\/|\.\/|\.\.\/|\/|[a-zA-Z0-9_-]+\.html(\?|#|$))/i.test(entry)) {
			return { label: entry, url: entry };
		}

		return { label: entry, url: "" };
	}

	function isExternalUrl(url) {
		try {
			var resolved = new URL(url, window.location.href);
			return resolved.origin !== window.location.origin;
		} catch (_err) {
			return false;
		}
	}

	function extractReadYear(entry) {
		var bracketed = entry.match(/^\[(\d{4})\]\s+(.+)$/);
		if (bracketed) {
			return { year: bracketed[1], entry: bracketed[2].trim() };
		}

		var prefixed = entry.match(/^(\d{4})\s*[|:-]\s+(.+)$/);
		if (prefixed) {
			return { year: prefixed[1], entry: prefixed[2].trim() };
		}

		return null;
	}

	function formatReadYearLabel(year) {
		if (/^\d{4}$/.test(year)) {
			return "'" + year.slice(2);
		}

		return year;
	}

	function renderReadingEntryListItem(list, entry) {
		var li = document.createElement("li");
		var parsedEntry = parseReadingEntry(entry);
		if (parsedEntry.url) {
			var link = document.createElement("a");
			link.href = parsedEntry.url;
			if (isExternalUrl(parsedEntry.url)) {
				link.target = "_blank";
				link.rel = "noopener";
			}
			link.textContent = parsedEntry.label;
			li.appendChild(link);
		} else {
			li.textContent = parsedEntry.label;
		}
		list.appendChild(li);
	}

	function renderReadItems(list, items) {
		var buckets = new Map();
		var other = [];

		items.forEach(function (rawEntry) {
			var yearParsed = extractReadYear(rawEntry);
			if (!yearParsed) {
				other.push(rawEntry);
				return;
			}

			if (!buckets.has(yearParsed.year)) {
				buckets.set(yearParsed.year, []);
			}

			buckets.get(yearParsed.year).push(yearParsed.entry);
		});

		var years = Array.from(buckets.keys()).sort(function (a, b) {
			return Number(b) - Number(a);
		});

		years.forEach(function (year) {
			var group = document.createElement("section");
			group.className = "read-year-group";

			var heading = document.createElement("h4");
			heading.className = "read-year-heading";
			heading.textContent = formatReadYearLabel(year);
			group.appendChild(heading);

			var yearList = document.createElement("ul");
			yearList.className = "read-year-items";

			(buckets.get(year) || []).forEach(function (entry) {
				renderReadingEntryListItem(yearList, entry);
			});

			group.appendChild(yearList);
			list.appendChild(group);
		});

		if (other.length) {
			var otherGroup = document.createElement("section");
			otherGroup.className = "read-year-group";

			if (years.length) {
				var otherHeading = document.createElement("h4");
				otherHeading.className = "read-year-heading";
				otherHeading.textContent = "Other";
				otherGroup.appendChild(otherHeading);
			}

			var otherList = document.createElement("ul");
			otherList.className = "read-year-items";

			other.forEach(function (entry) {
				renderReadingEntryListItem(otherList, entry);
			});

			otherGroup.appendChild(otherList);
			list.appendChild(otherGroup);
		}
	}

	function renderReadingList(sections) {
		var root = document.getElementById("reading-list-root");
		if (!root) return;

		root.innerHTML = "";
		var names = orderedSectionNames(sections);

		if (!names.length) {
			var empty = document.createElement("p");
			empty.textContent = "No entries yet.";
			root.appendChild(empty);
			return;
		}

		names.forEach(function (name) {
			var items = sections.get(name) || [];
			if (!items.length) return;

			var section = document.createElement("section");
			section.className = "reading-section";

			var label = document.createElement("h3");
			label.className = "reading-section-label author__name";
			label.textContent = sectionDisplayName(name);
			section.appendChild(label);

			if (name === "read") {
				section.classList.add("read-section");

				var readGroups = document.createElement("div");
				readGroups.className = "read-groups";

				renderReadItems(readGroups, items);
				section.appendChild(readGroups);
			} else {
				var list = document.createElement("ul");
				list.className = "reading-items";

				items.forEach(function (entry) {
					renderReadingEntryListItem(list, entry);
				});

				section.appendChild(list);
			}

			root.appendChild(section);
		});
	}

	function renderWritingList(groups) {
		var root = document.getElementById("writing-list-root");
		if (!root) return;

		root.innerHTML = "";
		var keys = Array.from(groups.keys());

		if (!keys.length) {
			var empty = document.createElement("p");
			empty.textContent = "No entries yet.";
			root.appendChild(empty);
			return;
		}

		var years = keys
			.filter(function (key) {
				return key !== "other";
			})
			.sort(function (a, b) {
				return Number(b) - Number(a);
			});

		if (groups.has("other")) {
			years.push("other");
		}

		var wrapper = document.createElement("div");
		wrapper.className = "writing-year-groups";

		years.forEach(function (yearKey) {
			var group = document.createElement("section");
			group.className = "writing-year-group";

			var heading = document.createElement("h3");
			heading.className = "writing-year-heading";
			heading.textContent = yearKey === "other" ? "Other" : formatReadYearLabel(yearKey);
			group.appendChild(heading);

			var list = document.createElement("ul");
			list.className = "writing-items";

			(groups.get(yearKey) || []).forEach(function (entry) {
				renderReadingEntryListItem(list, entry);
			});

			group.appendChild(list);
			wrapper.appendChild(group);
		});

		root.appendChild(wrapper);
	}

	function hydratePageFeatures(url) {
		updateLayoutState(url);

		if (isReadingPath(url)) {
			loadReadingEntries()
				.then(function (sections) {
					renderReadingList(sections);
				})
				.catch(function () {
					var root = document.getElementById("reading-list-root");
					if (!root) return;
					root.innerHTML = "<p>Unable to load reading list.</p>";
				});
		}

		if (isWritingPath(url)) {
			loadWritingEntries()
				.then(function (groups) {
					renderWritingList(groups);
				})
				.catch(function () {
					var root = document.getElementById("writing-list-root");
					if (!root) return;
					root.innerHTML = "<p>Unable to load writing list.</p>";
				});
		}

		if (isWritingPostPath(url)) {
			loadWritingPost();
		}
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

				hydratePageFeatures(url);

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

	initializeTheme();
	initializeNav();
	seedCurrentPage();
	hydratePageFeatures(window.location.href);

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
