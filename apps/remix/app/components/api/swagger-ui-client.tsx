'use client';

import { useEffect, useRef } from 'react';

import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

type SwaggerUIClientProps = {
  url: string;
};

export const SwaggerUIClient = ({ url }: SwaggerUIClientProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Add dark theme class if needed
    if (containerRef.current) {
      const isDark = document.documentElement.classList.contains('dark');
      if (isDark) {
        containerRef.current.classList.add('swagger-dark-theme');
      }

      // Watch for theme changes
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'class') {
            const isDark = document.documentElement.classList.contains('dark');
            if (containerRef.current) {
              if (isDark) {
                containerRef.current.classList.add('swagger-dark-theme');
              } else {
                containerRef.current.classList.remove('swagger-dark-theme');
              }
            }
          }
        });
      });

      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });

      return () => observer.disconnect();
    }
  }, []);

  return (
    <div ref={containerRef} className="h-full overflow-auto">
      <SwaggerUI
        url={url}
        deepLinking={true}
        displayRequestDuration={true}
        filter={true}
        showExtensions={true}
        showCommonExtensions={true}
        tryItOutEnabled={true}
        persistAuthorization={true}
        docExpansion="list"
        defaultModelsExpandDepth={1}
        defaultModelExpandDepth={1}
      />
    </div>
  );
};
