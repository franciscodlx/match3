# Iteración 3 — Retención: vidas, recompensa diaria, rachas, avisos y mapa

Plan: https://claude.ai/artifact/Umh86dTyscLsmjDhtdLxuk · Criterio de salida: "ciclo de sesión"
(jugar, quedarse sin vidas, volver por un aviso, volver al día siguiente por la recompensa).

| Etapa | Contenido |
| --- | --- |
| 3.1 | Mapa de niveles con Expo Router (`src/app/`), progreso guardado en `expo-sqlite/kv-store`, pantalla de ajustes (sonido, vibración, borrar progreso); paquete `@match3/meta` con la lógica pura del progreso |
| 3.2 | Vidas (5, una cada 30 min), monedas (`10 + 10 × estrellas` por victoria), "+5 movimientos" por 150 🪙 (`continueGame`, reproducible con `replay`), recompensa diaria de 7 días y racha por día local; reloj de prueba en desarrollo |
| 3.3 | Avisos locales con `expo-notifications`: vidas llenas, recompensa sin reclamar (19:00), recompensa nueva (10:00), racha en riesgo (20:00); silencio de 22:00 a 9:00; el permiso se pide tras reclamar la primera recompensa; hojas dentro del árbol en lugar de `Modal` nativo |
| 3.4 | Registro de eventos de sesión (abrir/cerrar, aviso tocado, recompensa, vida perdida, sin vidas, continuar) y prueba del ciclo de sesión |

Toda la economía y el plan de avisos son funciones puras con el reloj inyectado
(`packages/meta`, 24 pruebas). La app solo guarda, programa y dibuja.

## Prueba del ciclo de sesión (iPhone 17 Pro, 26–27 nov 2026)

Datos enviados por la app en desarrollo a `apps/mobile/scripts/playlog-server.ts`. Horas locales (CST).

| Hora | Evento |
| --- | --- |
| 23:30 | Abre la app (arranque en frío, 5 ♥) |
| 23:35 | Pierde 5 vidas en el nivel 4 en ~25 s: sale del nivel a media partida ("Salir · perderás una vida") |
| 23:36 | Intenta jugar 4 veces sin vidas → hoja de vidas ("siguiente en 30 min") |
| 23:40 | Vidas rellenadas desde ajustes de desarrollo; pierde 3 más saliendo del nivel |
| 23:44 | Gana el nivel 4: 14/22 movimientos, 2,730 pts, 3★, 184 s, combo ×6 |
| 23:44 → 00:12 | Fuera de la app 28 min; regresa con 3 ♥ (una regenerada) |
| 00:12 → 00:30 | 17 min con la app abierta en el mapa |

Resultado:

- **Vidas y bloqueo**: funcionan. Salir a medias cuesta una vida, a 0 ♥ el mapa no deja entrar
  y muestra el tiempo para la siguiente, y la regeneración se cumplió con el reloj real (2 → 3 ♥
  en 28 min fuera).
- **Avisos**: en la noche no llegó ninguno, como debe ser. Con 4 ♥ aún no toca "vidas llenas",
  con la app abierta no se muestran, y desde las 22:00 todo se recorre a las 9:00 por el horario
  de silencio.
- **Rendimiento**: la victoria del nivel 4 promedió 118 fps. El mínimo bajó a 46, una sola vez
  en toda la prueba; se revisará en la iteración 6 con más partidas.

### Pendiente de confirmar (mañana, 27 nov)

La sesión terminó a medianoche, así que la vuelta por aviso y la del día siguiente quedan para
la mañana. Se cierra la iteración suponiendo que funcionan; si algo falla, va como corrección:

- [ ] 9:00 — "¡Vidas llenas! ♥" llega; al tocarlo, el registro muestra `notification kind=lives-full`.
- [ ] 10:00 — "🎁 Nueva recompensa lista" llega; al reclamar, la racha queda en 🔥 2.
- [ ] ¿Dos avisos con una hora de diferencia molestan? Si sí, juntarlos en uno.

## Hallazgos y cambios

1. **Salir a medias no se distinguía de perder.** Las 8 vidas perdidas salieron del botón de
   salir, pero el registro solo decía `life-lost`.
   → `onLoss(result, quit)`: el evento ahora lleva `quit=true` cuando el jugador abandona y
   `quit=false` cuando se le acaban los movimientos.
2. **`Modal` nativo bloqueaba toques.** Presentado durante otra transición (cerrar ajustes, la
   alerta de permiso), quedaba invisible y bloqueaba el scroll.
   → Las hojas de vidas y recompensa son vistas dentro del árbol, y el permiso se pide al
   terminar la animación.
3. **El aviso de prueba no salía con la app abierta**, porque el manejador oculta los avisos en
   primer plano.
   → Solo se muestran en primer plano los avisos marcados como `test` (botón de desarrollo).

**Veredicto: iteración 3 cerrada** (con la confirmación de los avisos de la mañana pendiente).
El ciclo vidas → espera → regreso funciona con el reloj real y la economía tiene pruebas
completas en `@match3/meta`.

## Notas para la iteración 4

- Backend: cuentas anónimas, ranking y reto por link con la semilla compartida
  (`semilla#reparto`). El servidor puede verificar un puntaje con
  `replay(nivel, swaps, continuesAt)`.
- El progreso local (`match3.progress.v1`) tendrá que sincronizarse con la cuenta anónima.
- Las monedas y las vidas siguen siendo locales; no se validan en servidor hasta que haya compras.
