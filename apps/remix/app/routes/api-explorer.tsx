import { useEffect, useState } from 'react';

import { type MetaFunction } from 'react-router';

import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';

import { SwaggerUIClient } from '~/components/api/swagger-ui-client';

export const meta: MetaFunction = () => {
  return [
    { title: 'API Documentation - Documenso' },
    { name: 'description', content: 'Interactive API documentation for Documenso' },
  ];
};

const ClientOnlySwagger = ({ url }: { url: string }) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="flex h-screen items-center justify-center">Loading API documentation...</div>
    );
  }

  return <SwaggerUIClient url={url} />;
};

export default function ApiExplorer() {
  // Change this URL to point to your OpenAPI spec (YAML or JSON)
  // Examples:
  // - `/api/v1/openapi` for API v1
  // - `/api/v2/openapi.json` for API v2
  // - Or any external URL to your OpenAPI spec file
  const apiSpecUrl = `${NEXT_PUBLIC_WEBAPP_URL()}/api/v2/openapi.json`;

  return <ClientOnlySwagger url={apiSpecUrl} />;
}
