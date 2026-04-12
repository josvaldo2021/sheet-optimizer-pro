import * as XLSX from 'xlsx';
import { TreeNode } from './cnc-engine';
import { LayoutGroup } from './layout-utils';

interface ExtractedPiece {
  w: number;
  h: number;
  label?: string;
  count: number;
}

function extractPiecesFromTree(node: TreeNode, parents: TreeNode[] = []): ExtractedPiece[] {
  const piecesMap = new Map<string, ExtractedPiece>();
  
  const traverse = (n: TreeNode, currentParents: TreeNode[]) => {
    const yAncestor = [...currentParents].reverse().find(p => p.tipo === 'Y');
    const zAncestor = [...currentParents].reverse().find(p => p.tipo === 'Z');
    const wAncestor = [...currentParents].reverse().find(p => p.tipo === 'W');

    let pieceW = 0, pieceH = 0, isLeaf = false;

    if (n.tipo === 'Z' && n.filhos.length === 0) {
      pieceW = n.valor; pieceH = yAncestor?.valor || 0; isLeaf = true;
    } else if (n.tipo === 'W' && n.filhos.length === 0) {
      pieceW = zAncestor?.valor || 0; pieceH = n.valor; isLeaf = true;
    } else if (n.tipo === 'Q' && n.filhos.length === 0) {
      pieceW = n.valor; pieceH = wAncestor?.valor || 0; isLeaf = true;
    } else if (n.tipo === 'R') {
      const qAncestor = [...currentParents].reverse().find(p => p.tipo === 'Q');
      pieceW = qAncestor?.valor || 0; pieceH = n.valor; isLeaf = true;
    }

    if (isLeaf && pieceW > 0 && pieceH > 0) {
      const key = `${pieceW}x${pieceH}_${n.label || ''}`;
      const existing = piecesMap.get(key);
      if (existing) {
        existing.count += n.multi;
      } else {
        piecesMap.set(key, { w: pieceW, h: pieceH, label: n.label, count: n.multi });
      }
    }

    n.filhos.forEach(f => traverse(f, [...currentParents, n]));
  };

  traverse(node, parents);
  return Array.from(piecesMap.values());
}

export function exportLayoutsToExcel(layoutGroups: LayoutGroup[], filename: string = 'layouts-plano-de-corte') {
  const rows: any[] = [];
  
  // Header row
  rows.push({
    'Layout': 'Layout',
    'Qtd. Chapas': 'Qtd. Chapas',
    'Peça (ID)': 'Peça (ID)',
    'Largura (mm)': 'Largura (mm)',
    'Altura (mm)': 'Altura (mm)',
    'Qtd. por Chapa': 'Qtd. por Chapa',
    'Total de Peças': 'Total de Peças'
  });

  layoutGroups.forEach((group, gIdx) => {
    const pieces = extractPiecesFromTree(group.tree);
    
    pieces.forEach(p => {
      rows.push({
        'Layout': `Layout ${gIdx + 1}`,
        'Qtd. Chapas': group.count,
        'Peça (ID)': p.label || '-',
        'Largura (mm)': Math.round(p.w),
        'Altura (mm)': Math.round(p.h),
        'Qtd. por Chapa': p.count,
        'Total de Peças': p.count * group.count
      });
    });
    
    // Empty row for separation
    rows.push({});
  });

  const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Layouts");

  // Auto-size columns
  const colWidths = [12, 12, 20, 15, 15, 15, 15];
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  XLSX.writeFile(wb, `${filename}.xlsx`);
}
