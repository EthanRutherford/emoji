# emoji
This repo contains the code which generates the data for @rutherford/emoji. It fetches from github's emoji api to get shortcodes,
and combines that with category data from unicode.org as well as keywords from CLDR data.

Run `npm run build` to fetch fresh data from sources and compile the output.

### example
```js
const {fitzpatrickModifiers, emoji} = require("@rutherford/emoji");

> fitzpatrickModifiers
[ "🏻", "🏼", "🏽", "🏾", "🏿" ]

> emoji[0]
{
	name: "grinning",
	char: "😀",
	category: "Smileys & Emotion",
	subCategory: "face-smiling",
	keywords: ["face", "grin", "grinning"],
	fitzpatrick: false,
}
```
