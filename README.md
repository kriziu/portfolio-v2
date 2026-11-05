# brunodzi.dev

A small personal page. Plain HTML, one stylesheet and a few short scripts.

```sh
npm install
npm run dev
npm run build
```

Deploy with `npm run build`, then `wrangler deploy`. `wrangler.jsonc` serves `dist`.

The text mark at the top of the page is shaded in `src/scenes.ts`, painted in `src/color.ts` and animated in `src/main.ts`. `src/jackpot.ts` and `src/storm.ts` draw the page-wide part of the slots win. The WebGL engine that started in this folder moved to `~/Developer/ascii-engine`.
