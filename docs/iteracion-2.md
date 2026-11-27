# Iteración 2 — Especiales, objetivos, 15 niveles y juice

Plan: https://claude.ai/artifact/Umh86dTyscLsmjDhtdLxuk · Criterio de salida: "se siente bien jugar
10 minutos seguidos".

| Etapa | Contenido |
| --- | --- |
| 2.1 | Piezas especiales: línea H/V (4 en línea), bomba 3×3 (L/T), bomba de color (5+), disparos en cadena y 6 combinaciones al intercambiar dos especiales |
| 2.2 | Objetivos (puntos, recolectar color, gelatina), colores por nivel, estrellas, bonus de 50 por movimiento sobrante; paquete `@match3/levels` con 15 niveles en JSON, validador, bot y simulador |
| 2.3 | Juice: partículas y confeti en Skia, rayo/onda por especial, temblor del tablero, puntos flotantes, 14 sonidos sintetizados (`expo-audio`), vibración por combo/explosión (`expo-haptics`) |
| 2.4 | Prueba de 10 minutos con registro de partidas, tablero nuevo por intento, pista tras 5 s sin jugar, ajuste de niveles 3 y 9 |

## Prueba de juego (iPhone 17 Pro, 26-nov-2026)

10 partidas seguidas, unos 9 minutos de juego activo (sin contar las tarjetas), niveles 1 a 9.
Datos enviados por la app en desarrollo a `apps/mobile/scripts/playlog-server.ts`.

| Nivel | Resultado | Movs usados | Puntos | ★ | Bot (topK 8): victorias / movs sobrantes |
| --- | --- | --- | --- | --- | --- |
| 1 | ganó | 10 / 20 | 1,700 | 1 | 100 % / 15 |
| 2 | ganó | 10 / 20 | 1,820 | 2 | 86 % / 8 |
| 3 | perdió (23 / 25 rojas) | 20 / 20 | 3,370 | — | 99 % / 10 |
| 3 | ganó | 19 / 20 | 3,460 | 2 | |
| 4 | ganó | 10 / 22 | 2,100 | 2 | 79 % / 5 |
| 5 | ganó | 3 / 34 | 2,820 | 1 | 58 % / 12 |
| 6 | ganó | 15 / 22 | 2,160 | 2 | 74 % / 5 |
| 7 | ganó | 9 / 30 | 2,500 | 2 | 69 % / 10 |
| 8 | ganó | 4 / 20 | 2,780 | 3 | 45 % / 5 |
| 9 | perdió (15 / 16 gelatinas) | 32 / 32 | 2,960 | — | 59 % / 12 |

Rendimiento con todo el juice activo: 117.1 a 117.9 fps promedio, mínimo 104 (nivel 2), en
todas las partidas.

Opinión del jugador: "está padre, ahora tenemos sonidos, movimientos y más". De "¿cómo se
sintió?" solo contestó dos partidas: el nivel 1 "justo" y el 3 (perdido) "fácil".

## Hallazgos y cambios

1. **Siempre el mismo tablero.** El juego usaba la semilla fija del nivel, así que cada intento
   repartía el mismo tablero. El simulador, en cambio, juega un tablero distinto en cada partida.
   Los niveles 5 (3 movimientos) y 8 (4 movimientos, 3★) salieron así de fáciles por su tablero
   inicial, no por el diseño del nivel. Con un solo tablero fijo, la tasa de victorias del bot
   va de 30 % a 100 % según el nivel.
   → Ahora **cada intento reparte un tablero nuevo** (`semilla#reparto`). Objetivos, movimientos
   y gelatina siguen fijos. Cada partida registra su semilla, así que se puede reproducir exacta
   con `replay`. Los retos por link (iteración 4) mandarán el reparto exacto.
2. **Nivel 3, recolectar.** Perdió por 2 piezas y luego ganó con 1 movimiento de sobra, mientras
   el bot gana el 99 %. El bot va directo por el color pedido; una persona no tanto.
   → 20 → **22 movimientos**.
3. **Nivel 9, gelatina + puntos.** Perdió por una sola gelatina tras 32 movimientos y 10
   movimientos inválidos. La última gelatina en una fila del centro frustra.
   → 32 → **34 movimientos** (bot: 59 %, objetivo de ese tramo ~55 %).
4. **Movimientos inválidos frecuentes** (hasta 10 por partida).
   → **Pista**: tras 5 s sin jugar, dos piezas que hacen match empiezan a latir hasta el
   siguiente movimiento.
5. Las estrellas de los niveles 3 y 9 se recalcularon con el simulador (80 partidas, topK 8).

Contra el bot, la persona ganó con tantos o más movimientos de sobra en los niveles 2, 4, 6 y 7.
El bot "casual" (topK 8) queda como **piso** de habilidad: un nivel que el bot gana más o menos
la mitad de las veces le queda retador a una persona, no imposible.

**Veredicto: iteración 2 cerrada.** El juego se sostiene 10 minutos con buen ritmo, a ~117 fps.
La calibración fina de los niveles 10 a 15 se hará con más jugadores en TestFlight (iteración 6),
con la analítica real.

## Notas para la iteración 3

- Retención: vidas, recompensa diaria, rachas, notificaciones locales y mapa de niveles con
  Expo Router (`src/app/`). El atajo de desarrollo (tocar "Nivel") y el silencio con pulsación
  larga en "Movs" pasan a la pantalla de ajustes.
- Las estrellas y el progreso necesitan persistencia local.
- El registro de partidas (`EXPO_PUBLIC_PLAYLOG_URL`, `pnpm --filter mobile playlog`) sigue
  disponible para las siguientes pruebas.
