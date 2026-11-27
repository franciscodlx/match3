# Match3

Juego match-3 con modo AR. Plan: https://claude.ai/artifact/Umh86dTyscLsmjDhtdLxuk

Monorepo pnpm + turbo, basado en lo validado en el spike `ar-spike`.

| Ruta | Qué es |
| --- | --- |
| `apps/mobile` | App Expo (SDK 58, RN 0.88, nueva arquitectura) — `com.helmmxfarma.match3` |
| `packages/game-core` | Motor del juego en TypeScript puro y determinista (`@match3/game-core`) |
| `packages/levels` | Los 15 niveles en JSON, validador, bot y simulador de dificultad (`@match3/levels`) |
| `docs/` | Resultados por iteración |

## Desarrollo

```bash
pnpm install
pnpm test                                   # tests del motor y de niveles
cd apps/mobile && npx expo start --dev-client --port 8081
```

Herramientas:

```bash
pnpm --filter @match3/levels sim 80 8 [--write-stars]   # bot: % de victorias por nivel (y estrellas)
pnpm --filter mobile sounds                              # regenera assets/sfx desde el código
pnpm --filter mobile playlog                             # recibe las partidas de la app en playtest/
# Metro con registro de partidas (solo dev): EXPO_PUBLIC_PLAYLOG_URL=http://<IP-de-la-Mac>:8787 npx expo start ...
```

Build de desarrollo en el iPhone (equipo Helm, Z2G8RSF85P):

```bash
cd apps/mobile
npx expo prebuild -p ios --no-install && (cd ios && pod install)
cd ios && xcodebuild -workspace Match3.xcworkspace -scheme Match3 -configuration Debug \
  -destination id=<UDID> -derivedDataPath build -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=Z2G8RSF85P CODE_SIGN_STYLE=Automatic build
xcrun devicectl device install app --device <UDID> build/Build/Products/Debug-iphoneos/Match3.app
```

`ios/` y `android/` se generan (CNG): no editarlos a mano, configurar en `app.json`.
