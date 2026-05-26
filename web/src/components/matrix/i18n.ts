import { createContext, useContext } from 'react';

export type Lang = 'en' | 'es';

export const T = {
  en: {
    modulus: 'Modulus N',
    reset: 'Reset workspace',
    matrixA: 'Matrix A',
    matrixB: 'Matrix B',
    vectorB: 'Vector b',
    swapTitle: 'Swap A ↔ B (operations are not commutative)',
    swapAria: 'swap A and B',
    scalarK: 'scalar k',
    powerP: 'power p',
    rowIdx: 'row indices (0-based, comma-separated)',
    colIdx: 'col indices',
    compute: 'Compute',
    loading: 'Loading…',
    wasmNotReady: 'WASM not loaded yet',
    modulusMin: 'Modulus must be ≥ 2',
    bMustBeVector: (op: string, r: number, c: number) =>
      `${op}: B must be a column vector (${r}×${c})`,
    requiresSquare: (op: string, r: number, c: number) =>
      `${op} requires square A (got ${r}×${c})`,
    cannotCopy: (from: string, to: string, err: string) =>
      `Cannot copy ${from} into ${to}: ${err}`,
    cannotSave: (src: string, slot: number, err: string) =>
      `Cannot save matrix ${src} to S${slot}: ${err}`,
    indexOutOfRange: (t: string, max: number) =>
      `index "${t}" out of range (valid: 0..${max - 1})`,
    slotInspectorEmpty: 'empty slot',
    scalarLabel: 'scalar',
    matrixDimsLabel: (r: number, c: number) => `matrix ${r}×${c}`,

    operation: 'Operation',
    groupArithmetic: 'Arithmetic',
    groupStructure: 'Structure',
    groupSquare: 'Square-only',
    groupSystems: 'Systems',
    opSubmatrix: 'submatrix(A)',
    opRightInv: 'A⁻¹ right',
    opLeftInv: 'A⁻¹ left',

    resultPlaceholder: 'Run an operation to see the result here.',
    warnings: 'Warnings',
    result: 'Result',
    modShort: (n: number) => `mod ${n}`,
    dropOnSlotHint: 'or drop on a slot ↓',
    saveToSlot: (i: number) => `Save → S${i}`,
    dragToSlotTooltip: 'drag to a slot',
    consistent: 'CONSISTENT',
    inconsistent: 'INCONSISTENT',
    particularSolution: 'Particular solution',
    homogeneousBasis: (n: number) =>
      `Homogeneous basis (${n} free var${n === 1 ? '' : 's'})`,
    pivotsFree: (pivots: string, free: string) => `pivots: ${pivots} · free: ${free}`,
    rrefCaption: (rank: number, cols: string) =>
      `rank = ${rank} · pivots at columns ${cols}`,

    slots: 'Slots',
    slotsHint: 'drag a tile into a matrix cell · drop a matrix or the result here to save',
    dropFull: 'drop result / A / B here',
    dropAB: 'drop A or B here',
    squareBadge: 'square',
    inspectSlotAria: (i: number) => `inspect slot S${i}`,
    clearSlotAria: (i: number) => `clear S${i}`,

    matrixEditorDragTitle: (label: string) =>
      `drag ${label} onto a slot or onto the other matrix`,
    rows: 'rows',
    cols: 'cols',
    decreaseAria: (label: string) => `decrease ${label}`,
    increaseAria: (label: string) => `increase ${label}`,
    cellHint1: 'Integers,',
    cellHint2: 'or drop a slot / matrix / result here.',

    trace: (n: number) => `Trace (${n} step${n === 1 ? '' : 's'})`,
    snapshot: 'snapshot',
    pivotAt: (r: number, c: number, v: number) => `pivot @ (R${r}, C${c}) = ${v}`,
    cofactor: (i: number, j: number, sign: string, det: number) =>
      `cofactor C${i},${j} = (${sign}) det(minor) = ${det}`,
  },
  es: {
    modulus: 'Módulo N',
    reset: 'Reiniciar workspace',
    matrixA: 'Matriz A',
    matrixB: 'Matriz B',
    vectorB: 'Vector b',
    swapTitle: 'Intercambiar A ↔ B (las operaciones no son conmutativas)',
    swapAria: 'intercambiar A y B',
    scalarK: 'escalar k',
    powerP: 'potencia p',
    rowIdx: 'índices de fila (base 0, separados por comas)',
    colIdx: 'índices de columna',
    compute: 'Calcular',
    loading: 'Cargando…',
    wasmNotReady: 'WASM aún no está cargado',
    modulusMin: 'El módulo debe ser ≥ 2',
    bMustBeVector: (op: string, r: number, c: number) =>
      `${op}: B debe ser un vector columna (${r}×${c})`,
    requiresSquare: (op: string, r: number, c: number) =>
      `${op} requiere que A sea cuadrada (recibida ${r}×${c})`,
    cannotCopy: (from: string, to: string, err: string) =>
      `No se puede copiar ${from} en ${to}: ${err}`,
    cannotSave: (src: string, slot: number, err: string) =>
      `No se puede guardar la matriz ${src} en S${slot}: ${err}`,
    indexOutOfRange: (t: string, max: number) =>
      `índice "${t}" fuera de rango (válido: 0..${max - 1})`,
    slotInspectorEmpty: 'slot vacío',
    scalarLabel: 'escalar',
    matrixDimsLabel: (r: number, c: number) => `matriz ${r}×${c}`,

    operation: 'Operación',
    groupArithmetic: 'Aritmética',
    groupStructure: 'Estructura',
    groupSquare: 'Solo cuadradas',
    groupSystems: 'Sistemas',
    opSubmatrix: 'submatriz(A)',
    opRightInv: 'A⁻¹ derecha',
    opLeftInv: 'A⁻¹ izquierda',

    resultPlaceholder: 'Ejecuta una operación para ver el resultado aquí.',
    warnings: 'Advertencias',
    result: 'Resultado',
    modShort: (n: number) => `mod ${n}`,
    dropOnSlotHint: 'o suelta en un slot ↓',
    saveToSlot: (i: number) => `Guardar → S${i}`,
    dragToSlotTooltip: 'arrastra a un slot',
    consistent: 'CONSISTENTE',
    inconsistent: 'INCONSISTENTE',
    particularSolution: 'Solución particular',
    homogeneousBasis: (n: number) =>
      `Base homogénea (${n} variable${n === 1 ? '' : 's'} libre${n === 1 ? '' : 's'})`,
    pivotsFree: (pivots: string, free: string) => `pivotes: ${pivots} · libres: ${free}`,
    rrefCaption: (rank: number, cols: string) =>
      `rango = ${rank} · pivotes en las columnas ${cols}`,

    slots: 'Slots',
    slotsHint: 'arrastra un slot a una celda · suelta una matriz o el resultado aquí para guardar',
    dropFull: 'suelta resultado / A / B aquí',
    dropAB: 'suelta A o B aquí',
    squareBadge: 'cuadrada',
    inspectSlotAria: (i: number) => `inspeccionar slot S${i}`,
    clearSlotAria: (i: number) => `limpiar S${i}`,

    matrixEditorDragTitle: (label: string) =>
      `arrastra ${label} a un slot o a la otra matriz`,
    rows: 'filas',
    cols: 'cols',
    decreaseAria: (label: string) => `disminuir ${label}`,
    increaseAria: (label: string) => `aumentar ${label}`,
    cellHint1: 'Enteros,',
    cellHint2: 'o suelta un slot / matriz / resultado aquí.',

    trace: (n: number) => `Traza (${n} paso${n === 1 ? '' : 's'})`,
    snapshot: 'instantánea',
    pivotAt: (r: number, c: number, v: number) => `pivote @ (R${r}, C${c}) = ${v}`,
    cofactor: (i: number, j: number, sign: string, det: number) =>
      `cofactor C${i},${j} = (${sign}) det(menor) = ${det}`,
  },
} as const;

export const LangContext = createContext<Lang>('en');
export const useT = () => T[useContext(LangContext)];
export const useLang = () => useContext(LangContext);
