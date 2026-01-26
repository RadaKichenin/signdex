import { useEffect, useState } from 'react';

import { type MetaFunction } from 'react-router';

import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';

import { SwaggerUIClient } from '~/components/api/swagger-ui-client';

export const meta: MetaFunction = () => {
  return [
    { title: 'API v2 Documentation - Documenso' },
    { name: 'description', content: 'Explore Documenso API v2 with interactive documentation' },
  ];
};

const ClientOnlySwagger = ({ url }: { url: string }) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return <div className="p-8 text-center">Loading API documentation...</div>;
  }

  return <SwaggerUIClient url={url} />;
};

export default function ApiExplorerV2() {
  const apiUrl = `${NEXT_PUBLIC_WEBAPP_URL()}/api/v2/openapi.json`;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <a
              href="/api-explorer"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              <span>Back to API Explorer</span>
            </a>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="rounded bg-purple-100 px-2 py-1 text-xs font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                Beta
              </span>
              <h1 className="text-lg font-semibold">API v2 Documentation</h1>
            </div>
          </div>
          <a
            href="/"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to App
          </a>
        </div>
      </div>

      {/* Swagger UI */}
      <div className="flex-1 overflow-hidden">
        <ClientOnlySwagger url={apiUrl} />
      </div>
    </div>
  );
}
