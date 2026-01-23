import { ClientOnly } from '../../components/client-only';

import { VirtualizedPDFViewer, type VirtualizedPDFViewerProps } from './virtualized';

export const VirtualizedPDFViewerLazy = (props: VirtualizedPDFViewerProps) => {
  return (
    <ClientOnly fallback={<div>Loading...</div>}>
      {() => <VirtualizedPDFViewer {...props} />}
    </ClientOnly>
  );
};
