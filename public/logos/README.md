# Logos del header de /tv (Apertura de Locales)

Poné acá los logos reales de las 3 marcas. El tablero los busca por nombre, en este
orden de preferencia: **.svg** primero, si no **.png**. Si no encuentra ninguno, deja
el texto como fallback (no se rompe nada).

Nombres exactos (todo en minúscula):

| Marca          | Archivo (preferido)      | Fallback         |
|----------------|--------------------------|------------------|
| Mr. Tasty      | `mr-tasty.svg`  o `.png` | `mr-tasty.png`   |
| El Desembarco  | `el-desembarco.svg` o `.png` | `el-desembarco.png` |
| Mila & Go      | `mila-go.svg` o `.png`   | `mila-go.png`    |

Recomendaciones:
- **SVG** es lo ideal (nítido a cualquier tamaño, incluido 4K).
- Si son PNG, que sean de alto ~200px o más y **fondo transparente**.
- El header los muestra a ~72px de alto respetando proporción; centrados.
- Apenas los subís y deployás, aparecen solos en `/tv` (no hay que tocar código).
