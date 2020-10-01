# emoji
This emoji module is built by fetching from github's emoji api to get shortcodes,
and combining that with category data from unicode.org as well as keywords from CLDR data.

### building from source
To fetch fresh data and rebuild the output, clone this repo and run `npm run build`.

### example
```js
const {fitzpatrickModifiers, emoji} = require("@rutherford/emoji");

> fitzpatrickModifiers
[ "🏻", "🏼", "🏽", "🏾", "🏿" ]

> emoji[0]
{
	names: ["grinning"],
	char: "😀",
	category: "Smileys & Emotion",
	subCategory: "face-smiling",
	keywords: ["face", "grin", "grinning"],
	fitzpatrick: false,
}
```
