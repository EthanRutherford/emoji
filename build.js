const https = require("https");
const fs = require("fs");
const zlib = require("zlib");
const tar = require("tar-fs");
const xml2js = require("xml2js");

const fitzpatrickModifiers = [127995, 127996, 127997, 127998, 127999].map((n) => String.fromCodePoint(n));
const toChar = (cps) => cps.map((cp) => String.fromCodePoint(Number.parseInt(cp, 16))).join("");
const normalizeCp = (char) => char.replace(/[\ufe00-\ufe0f\u200d]/g, "");

function get(url, handler) {
	https.get(url, {headers: {"User-Agent": "github emoji"}}, (response) => {
		if (response.statusCode === 301 || response.statusCode === 302) {
			get(response.headers.location, handler);
		} else {
			handler(response);
		}
	});
}

function downloadCLDR() {
	return new Promise((resolve) => {
		get("https://github.com/unicode-org/cldr/archive/latest.tar.gz", (response) => {
			const pipe = response.pipe(zlib.createGunzip()).pipe(tar.extract("./tmp"));
			response.on("end", () => {
				pipe.destroy();
				resolve();
			});
		});
	});
}

function parseAnnotations() {
	return new Promise((resolve) => {
		fs.readFile("./tmp/cldr-latest/common/annotations/en.xml", (_, data) => {
			xml2js.parseString(data, (_, result) => {
				const annotations = result.ldml.annotations[0].annotation;
				const filtered = annotations.filter((a) => a.$.type == null);
				const mapped = filtered.map((a) => ({cp: normalizeCp(a.$.cp), keywords: a._}));
				resolve(mapped);
			});
		});
	});
}

function parseDerivedAnnotations() {
	return new Promise((resolve) => {
		fs.readFile("./tmp/cldr-latest/common/annotationsDerived/en.xml", (_, data) => {
			xml2js.parseString(data, (_, result) => {
				const annotations = result.ldml.annotations[0].annotation;
				const filtered = annotations.filter((a) => a.$.type == null);
				const mapped = filtered.map((a) => ({cp: normalizeCp(a.$.cp), keywords: a._}));
				resolve(mapped);
			});
		});
	});
}

function fetchEmojiCategories() {
	const codepointRegex = /^([0-9a-f]+(?: [0-9a-f]+)*)\s*;/i;

	return new Promise((resolve) => {
		get("https://unicode.org/Public/emoji/13.1/emoji-test.txt", (response) => {
			let data = "";
			response.on("data", (d) => data += d);
			response.on("end", () => {
				const seen = new Set();
				const list = [];

				let curGroup;
				let curSubGroup;
				const lines = data.split("\n");
				for (const line of lines) {
					const trimmed = line.trim();
					if (trimmed.length === 0) {
						continue;
					}

					if (trimmed.startsWith("#")) {
						if (trimmed.startsWith("# group: ")) {
							curGroup = trimmed.split("# group: ")[1];
						} else if (trimmed.startsWith("# subgroup: ")) {
							curSubGroup = trimmed.split("# subgroup: ")[1];
						}
					} else {
						const codePoints = trimmed.match(codepointRegex)[1].split(" ");
						const char = toChar(codePoints);
						if (seen.has(normalizeCp(char))) {
							continue;
						} else {
							seen.add(normalizeCp(char));
						}

						list.push({char, category: curGroup, subCategory: curSubGroup});
					}
				}

				resolve(list);
			});
		});
	});
}

function fetchGithubEmoji() {
	return new Promise((resolve) => {
		get("https://api.github.com/emojis", (response) => {
			let data = "";
			response.on("data", (d) => data += d);
			response.on("end", () => {
				const out = {};
				for (const [name, url] of Object.entries(JSON.parse(data))) {
					if (!url.includes("unicode")) {
						continue;
					}

					const parts = url.split("/");
					const filename = parts[parts.length - 1];
					const codePoints = filename.split(".png")[0].split("-");
					const char = toChar(codePoints);

					if (out[char] == null) {
						out[char] = [];
					}

					out[char].push(name);
				}

				resolve(out);
			});
		});
	});
}

function processKeywords(keywords) {
	const ignoreWords = new Set([
		"on",
		"the",
		"of",
		"in",
		"a",
		"over",
		"with",
		"from",
		"for",
		"and",
	]);

	const set = new Set();
	for (const keyword of keywords) {
		const clean = keyword.toLowerCase().replace(/[“”()]|: /g, "").normalize();
		const words = clean.split(" ");
		for (const word of words) {
			const trimmed = word.trim();
			if (trimmed.length !== 0 && !ignoreWords.has(trimmed)) {
				set.add(trimmed);
			}
		}
	}

	return [...set];
}

(async () => {
	const cldrPromise = downloadCLDR();
	const annotationsPromise = cldrPromise.then(parseAnnotations);
	const derivedAnnotationsPromise = cldrPromise.then(parseDerivedAnnotations);
	const categoriesPromise = fetchEmojiCategories();

	const githubEmoji = await fetchGithubEmoji();
	const categories = await categoriesPromise;
	const annotations = await annotationsPromise;
	const derivedAnnotations = await derivedAnnotationsPromise;

	const annotationsMap = {};
	for (const annotation of annotations) {
		annotationsMap[annotation.cp] = {
			keywords: annotation.keywords.split(" | "),
			fitzpatrick: false,
		};
	}

	const fitzpatrickRemover = new RegExp(fitzpatrickModifiers.join("|"), "g");
	for (const annotation of derivedAnnotations) {
		if (annotation.cp.match(fitzpatrickRemover) != null) {
			const char = annotation.cp.replace(fitzpatrickRemover, "");
			if (annotationsMap[char] != null) {
				annotationsMap[char].fitzpatrick = true;
			}
		} else {
			annotationsMap[annotation.cp] = {
				keywords: annotation.keywords.split(" | "),
				fitzpatrick: false,
			};
		}
	}

	const output = {
		fitzpatrickModifiers,
		emoji: [],
	};

	for (const entry of categories) {
		const normalChar = normalizeCp(entry.char);
		const emojiNames = githubEmoji[normalChar];
		if (emojiNames != null) {
			const {keywords, fitzpatrick} = annotationsMap[normalChar];
			output.emoji.push({
				names: emojiNames,
				...entry,
				keywords: processKeywords(keywords),
				fitzpatrick,
			});
		}
	}

	if (Object.keys(githubEmoji).length !== output.emoji.length) {
		throw new Error("missing emojis!");
	}

	fs.writeFileSync("./out.json", JSON.stringify(output));
	fs.rmdirSync("./tmp", {recursive: true});
})();
