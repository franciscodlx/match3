# Iteración 1 — Motor y render básico

Plan: https://claude.ai/artifact/Umh86dTyscLsmjDhtdLxuk · Criterio de salida: una partida completa
jugable, 60 fps.

| Etapa | Contenido |
| --- | --- |
| 1.1 | Monorepo pnpm + turbo; `apps/mobile` (Expo SDK 58, `com.helmmxfarma.match3`, equipo Helm) |
| 1.2 | `@match3/game-core` determinista: RNG con semilla, cascadas con combo, puntaje, movimientos, victoria/derrota, replay (20 tests) |
| 1.3 | Tablero Skia jugable: swipe, animaciones por paso del motor, HUD, tarjeta de fin, 3 niveles |

## Resultado en iPhone 17 Pro (26-nov-2026)

Niveles 1 a 3 jugados completos y superados. Medición de una partida completa del nivel 3
(1,500 / 1,500 puntos, sobró 1 movimiento), con ProMotion a 120 Hz:

| Métrica | Valor |
| --- | --- |
| Duración medida | 64 s |
| fps promedio / mínimo | 117.4 / 113 |
| Frames lentos (> 20.7 ms) | 0.1 % |

**Veredicto: iteración 1 cerrada.** Supera el criterio de 60 fps con margen.

## Notas para la iteración 2

- Puntaje base: 10 por pieza, +20 por línea de 4, +50 por línea de 5+, × número de cascada. Las
  líneas de 4/5 y L/T se convertirán en piezas especiales.
- Metas de los niveles de prueba calibradas con 300 partidas al azar de 20 movimientos
  (p10 960, mediana 1,410, p90 1,980). El nivel 3 (15 / 1,500) quedó justo: se pasó con 1 movimiento.
- Los niveles viven en `apps/mobile/src/levels.ts`; pasarán a JSON.
- Navegación: aún sin Expo Router; entra con el mapa de niveles (iteración 3).
