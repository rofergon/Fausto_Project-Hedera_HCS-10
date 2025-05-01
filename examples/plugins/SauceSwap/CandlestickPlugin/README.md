# SauceSwap Chart Plugin

Este plugin genera gráficos de velas (candlestick) para pools de SauceSwap, permitiendo visualizar datos históricos de precios, volumen y liquidez.

## Características

- **Gráficos de velas** con formato profesional
- **Generación automática** de rangos de tiempo e intervalos
- **Cálculo estadístico** (máximos, mínimos, promedios)
- **Visualización de volumen**
- **Formato temporal flexible** ("1h", "4h", "1d", "1w", "3d 12h", etc.)
- **Guardado local** de imágenes como PNG

## Instalación

1. Asegúrate de tener todas las dependencias instaladas:
```bash
npm install canvas axios
```

2. Registra el plugin en tu aplicación:
```typescript
import SauceSwapChartPlugin from './plugins/SauceSwap/CandlestickPlugin';

// En tu función de inicialización
const chartPlugin = new SauceSwapChartPlugin();
await pluginRegistry.registerPlugin(chartPlugin);
```

## Uso

### Desde la línea de comandos

Para probar el generador de gráficos puedes usar:

```bash
npm run sauceswap-chart-test
```

Esto generará varios gráficos de ejemplo para las pools 1 y 2 con diferentes intervalos de tiempo.

### En código

```typescript
import { CandlestickFetcher } from './utils/candlestickFetcher';
import { ChartRenderer } from './utils/chartRenderer';

// Crear instancias
const fetcher = new CandlestickFetcher('mainnet');
const renderer = new ChartRenderer();

// Obtener datos
const chartData = await fetcher.getChartData(
  1,                 // Pool ID
  '1d',              // Rango de tiempo
  false              // Invertido (opcional)
);

// Guardar gráfico
const outputPath = './charts/mi_grafico.png';
await renderer.renderChart(chartData, outputPath);
```

### Como herramienta del agente

El agente puede usar la herramienta `get_sauceswap_chart` para generar gráficos. Ejemplos de consultas:

- "Muéstrame el gráfico del pool 1 de las últimas 4 horas"
- "Dame el chart del pool 2 de la última semana"
- "Quiero ver el gráfico del pool 3 de los últimos 2 días"
- "Genera un gráfico de 5 días para el pool 4"

## Estructura de archivos

```
CandlestickPlugin/
  ├── index.ts                   # Punto de entrada del plugin
  ├── plugin.json                # Configuración del plugin
  ├── __tests__/                 # Tests
  │   └── chartTest.ts           # Test del generador de gráficos
  └── utils/
      ├── candlestickFetcher.ts  # Obtención de datos
      ├── chartRenderer.ts       # Generación visual
      └── timeCalculations.ts    # Utilidades de tiempo
```

## Personalización

### Tamaño y estilo

Puedes ajustar las dimensiones y colores del gráfico:

```typescript
const renderer = new ChartRenderer({
  width: 1600,       // Ancho en píxeles
  height: 900,       // Alto en píxeles
  padding: 60,       // Espaciado interior
  priceAxisWidth: 100, // Ancho del eje Y
  timeAxisHeight: 80   // Alto del eje X
});
```

### Directorio de salida

```typescript
// En el plugin principal
this.outputDir = context.config.chartOutputDir || './charts';
```

## API Reference

### CandlestickFetcher

```typescript
getChartData(
  poolId: number,        // ID del pool
  timeRange: string,     // Rango de tiempo (ej: "1d", "4h", "1w")
  inverted: boolean = false  // Invertir cálculo de precio
): Promise<CandlestickChartData>
```

### ChartRenderer

```typescript
renderChart(
  data: CandlestickChartData,  // Datos del gráfico
  outputPath: string           // Ruta de salida para guardar PNG
): Promise<string>
```

## Licencia

Este plugin está bajo la licencia Apache-2.0. 