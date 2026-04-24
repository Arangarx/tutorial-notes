// TypeScript ambient declarations for side-effect CSS imports.
//
// Next.js bundles CSS imports natively, but the TypeScript compiler
// needs a module declaration so `import "@excalidraw/excalidraw/index.css"`
// (and any future CSS-only imports we add) type-check cleanly.
//
// `*.css` covers the general case; the explicit declaration for
// Excalidraw's package-relative CSS export is needed because TS 5.x's
// resolver doesn't follow that conditional `exports` map field for
// declaration lookups even though the runtime resolves it fine.

declare module "*.css";
declare module "@excalidraw/excalidraw/index.css";
