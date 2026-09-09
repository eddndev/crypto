# Elliptic Curve

Práctica 01 de Selected Topics in Cryptography (C709), sesión del 8 de septiembre
de 2026. Eduardo Alonso Sánchez, grupo 7CM1, Sandra Díaz Santiago.

## C estándar, sin bibliotecas externas

El ejecutable solo usa encabezados estándar de C17. `bigint.c` guarda enteros
de hasta 2048 bits en arreglos de `uint32_t`, con una celda adicional para el
acarreo. La multiplicación usa productos `uint64_t` y reducción de Montgomery.
La potencia modular usa cuadrados sucesivos; el inverso usa a^(p-2) con p primo.
No usa GMP, OpenSSL, `__int128` ni bibliotecas de criptografía.

Los frameworks de la web, las herramientas para pruebas y la generación del
reporte están permitidos por la política de la materia. No se enlazan con el
programa nativo en C.

## Compilar y probar cada función

Desde este directorio:

```sh
make native
./build/elliptic-curve qr 7
./build/elliptic-curve curve 17 2 2 build/puntos-17.txt
./build/elliptic-curve generate 2048 20262956
./build/elliptic-curve add 65537 1 1 49606 64426 1 2565 62370 1
./build/elliptic-curve double 65537 1 1 49606 64426 1
```

Para compilar únicamente el programa basta un compilador de C17:

```sh
cc -std=c17 -O2 -Wall -Wextra -Wpedantic -Iinclude src/*.c -o elliptic-curve
```

- `qr p`: tabla de residuos y raíces; el cero se muestra por separado.
- `curve p a b [archivo]`: enumera, cuenta y guarda los puntos usando esa tabla.
  Incluye `(0,1,0)`; los demás puntos son `(x,y,1)`. Reemplaza el archivo indicado;
  el nombre por omisión es `elliptic-curve-points.txt`.
- `generate nbits [semilla]`: genera p, a, b con 3 a 2048 bits para p. Si se omite
  la semilla, usa `time(NULL)`. Una semilla reproduce la corrida en el mismo
  entorno; distintas implementaciones de `rand` pueden dar otros resultados.
- `add p a b Px Py Pz Qx Qy Qz`: suma dos puntos válidos. También maneja infinito,
  puntos iguales y puntos opuestos.
- `double p a b Px Py Pz`: duplica un punto válido; y=0 devuelve el infinito.

Se aceptan enteros decimales no negativos y coeficientes/coordenadas menores
que p. Solo se admite z=1 o el infinito canónico `(0,1,0)`. Una entrada inválida
produce un mensaje en stderr y un código distinto de cero.

En `qr`, `curve`, `add` y `double` se supone que p es primo >3. Se rechazan
módulos pares y curvas singulares. La enumeración consume O(p) tiempo y memoria:
se usa para campos pequeños, no para enumerar curvas de 2048 bits. La web limita
esa enumeración a p<=10000; la CLI acepta uint32_t según memoria y tiempo disponibles.

La generación usa división por enteros pequeños y 32 rondas de Miller–Rabin,
implementadas a mano. Produce **primos probables**, no certificados de primalidad.
`rand` es estándar, pero esta generación es didáctica y no sirve para claves reales.
C estándar no incluye un generador de primos: la política del estudiante pide
implementarlo en C, aunque el enunciado permite usar uno existente.

## Archivos fuente

- `src/quadratic_residues.c`: tabla y raíces.
- `src/elliptic_curve.c`: enumeración, conteo y salida a archivo.
- `src/bigint.c`: arreglos, conversiones, aritmética modular y Miller–Rabin.
- `src/curve_arithmetic.c`: validación, generación, suma y duplicación.
- `src/arithmetic_cli.c`: comandos para enteros grandes y entrada textual web.
- `src/main.c`: selección independiente de cada ejercicio.
- `include/`: tipos y declaraciones de las funciones.

El reporte muestra completas las funciones solicitadas, con sus auxiliares de
curva. Todo el código, incluidos los auxiliares de enteros y de entrada, está
en `src/` e `include/`.

## Web y pruebas

Desde la raíz de `crypto/`:

```sh
bash scripts/setup-emsdk.sh
source .tools/emsdk/emsdk_env.sh
make test-c
cd web
npm ci
npm run dev
```

Emscripten 4.0.15 compila el mismo C a WebAssembly. Los comandos grandes se
transmiten como texto y se ejecutan en un Worker para mantener disponible la
interfaz. No se convierten sus parámetros a números de JavaScript.
Rutas: `/es/stic/elliptic-curve` y `/stic/elliptic-curve`.

`make test` ejecuta el oráculo de Python para 444 curvas pequeñas, raíces,
archivos, operaciones de hasta 2048 bits, números compuestos, los cuatro casos
del enunciado y casos especiales. Node compara las salidas nativas con WASM y
prueba generación en los seis tamaños. Python y Node son herramientas de prueba,
no dependencias del programa en C.

## Resultados y reporte

`assets/resultados/` conserva las tres listas de puntos, las gráficas, los seis
conjuntos p/a/b, las doce operaciones del enunciado y las transcripciones.
Los enteros grandes de los JSON se guardan como cadenas para conservar sus dígitos.

Para regenerar desde la raíz de `crypto/`:

```sh
python3 scripts/generate-lab-curves.py
# Requiere matplotlib solo para dibujar las gráficas.
python3 scripts/lab-results.py
# Primero construir la web e iniciar npm run preview -- --port 4321.
node scripts/capture-complete.cjs
make report
```

La captura requiere Playwright y Chrome. Se pueden indicar `PLAYWRIGHT_MODULE`,
`CHROME_PATH` y `EC_PREVIEW_URL`. `fuentes-final.json` guarda las huellas de los
fuentes mostrados en las capturas. El PDF usa la plantilla ESCOM, XeLaTeX y
`contenido/03-completa.tex`. `make clean-report` conserva el PDF final.

IA utilizada: ChatGPT/Codex generó los fuentes de C y apoyó las pruebas, la web
y el reporte. Las fórmulas y resultados se contrastaron con un oráculo independiente.

Referencias de los métodos: [suma y duplicación, Ben Lynn](https://crypto.stanford.edu/pbc/notes/elliptic/explicit.html),
[Miller–Rabin, HAC §4.2.3](https://cacr.uwaterloo.ca/hac/about/chap4.pdf).
