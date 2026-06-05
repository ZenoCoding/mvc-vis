# Calc3D (mvc-vis)

**Calc3D** is a beautiful, interactive 3D graphing calculator and visualization sandbox designed for multivariable calculus. It allows students and educators to plot complex mathematical objects and develop deep geometric intuition for vector fields, derivatives, and surfaces.

---

## Key Features

* **3D Surface Plotting:** Graph explicit surfaces of the form $z = f(x, y)$ with support for customized domain bounds and transparency.
* **Implicit Surface Graphing:** Plot implicit equations (e.g., $x^2 + y^2 + z^2 = 9$ or $z^2 - x^2 - y^2 = 1$) rendered in real-time using a fast **Marching Tetrahedra** polygonization algorithm.
* **Parametric Curves:** Visualize 3D curves defined by vector-valued functions $\mathbf{r}(t) = \langle x(t), y(t), z(t) \rangle$ with dynamic tangent vectors.
* **Vector Fields & Streamlines:** Graph 3D vector fields $\mathbf{F}(x, y, z)$ in two modes:
  * **Volume / Slice:** View vectors in a 3D grid volume or projected onto a 2D slice plane.
  * **Arrows / Streamline Lines:** Choose between traditional arrow grids or trace continuous streamline flow lines.
* **Interactive Mathematical Probe:** Click and drag a 3D probe through the graph to calculate and display real-time readouts of:
  * Local vector field evaluation
  * Gradient vectors
  * Tangent planes
  * Divergence and Curl values
* **Aesthetics:** A premium dark mode UI, smooth camera controls, and customizable grids/axes.

---

## Tech Stack

* **Framework:** React 19 + TypeScript + Vite
* **Rendering:** High-performance custom 3D math projection engine rendering to HTML5 Canvas
* **Styling:** Vanilla CSS glassmorphic user interface
* **Icons:** Lucide React

---

## Getting Started

### Installation
Clone the repository and install dependencies:
```bash
npm install
```

### Running Locally
Start the Vite development server:
```bash
npm run dev
```

### Production Build
Build the optimized bundle:
```bash
npm run build
```
