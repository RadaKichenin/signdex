#!/bin/bash

# Script to find all PDF viewer usages in the codebase
# This helps identify where to replace with the optimized virtualized viewer

echo "============================================"
echo "PDF Viewer Usage Finder"
echo "============================================"
echo ""

echo "Searching for PDFViewerLazy usage..."
echo "--------------------------------------------"
grep -rn "PDFViewerLazy" apps/remix/app/ --include="*.tsx" --include="*.ts" | while IFS=: read -r file line content; do
    echo "File: $file (Line $line)"
    echo "  Code: $(echo $content | xargs)"
    echo ""
done

echo ""
echo "============================================"
echo "Searching for direct PDFViewer imports..."
echo "--------------------------------------------"
grep -rn "from '@documenso/ui/primitives/pdf-viewer" apps/remix/app/ --include="*.tsx" --include="*.ts" | while IFS=: read -r file line content; do
    echo "File: $file (Line $line)"
    echo "  Import: $(echo $content | xargs)"
    echo ""
done

echo ""
echo "============================================"
echo "Summary"
echo "============================================"
echo ""

PDF_VIEWER_COUNT=$(grep -r "PDFViewerLazy" apps/remix/app/ --include="*.tsx" --include="*.ts" | wc -l)
echo "Total PDFViewerLazy usages found: $PDF_VIEWER_COUNT"

echo ""
echo "Recommended Actions:"
echo "1. Review each file listed above"
echo "2. For documents with 10+ pages, replace PDFViewerLazy with VirtualizedPDFViewerLazy"
echo "3. Update imports:"
echo "   OLD: import { PDFViewerLazy } from '@documenso/ui/primitives/pdf-viewer/lazy';"
echo "   NEW: import { VirtualizedPDFViewerLazy } from '@documenso/ui/primitives/pdf-viewer/virtualized-lazy';"
echo ""
echo "For detailed instructions, see: PDF_OPTIMIZATION_IMPLEMENTATION.md"
echo ""
