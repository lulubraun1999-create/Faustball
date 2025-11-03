
'use client';

import {
  useDoc,
  useFirestore,
  useMemoFirebase,
} from '@/firebase';
import type { NewsArticle } from '@/lib/types';
import { doc, Timestamp } from 'firebase/firestore';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NewsArticlePage() {
  const { id } = useParams();
  const firestore = useFirestore();

  const articleId = typeof id === 'string' ? id : '';

  const articleRef = useMemoFirebase(
    () => (firestore && articleId ? doc(firestore, 'news', articleId) : null),
    [firestore, articleId]
  );

  const { data: article, isLoading } = useDoc<NewsArticle>(articleRef);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-center">
        <h1 className="text-2xl font-bold">Artikel nicht gefunden</h1>
        <p className="text-muted-foreground">Der angeforderte Artikel konnte nicht gefunden werden.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
        <div className="mb-8">
          <Button asChild variant="outline">
            <Link href="/verwaltung/news">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück zur Übersicht
            </Link>
          </Button>
        </div>
        <article className="space-y-8">
            {article.imageUrls && article.imageUrls.length > 0 && (
                <div className="relative aspect-video w-full overflow-hidden rounded-lg">
                <Image
                    src={article.imageUrls[0]}
                    alt={article.title}
                    fill
                    style={{objectFit: "cover"}}
                    className="bg-muted"
                />
                </div>
            )}
            
            <div className="space-y-2 text-center">
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight lg:text-5xl font-headline">{article.title}</h1>
                <p className="text-muted-foreground">
                    Veröffentlicht am{' '}
                    {article.createdAt instanceof Timestamp
                        ? article.createdAt.toDate().toLocaleDateString('de-DE', {
                            year: 'numeric', month: 'long', day: 'numeric'
                        })
                        : 'N/A'}
                </p>
            </div>

            <div className="prose prose-lg dark:prose-invert max-w-none mx-auto break-words">
                <p className="whitespace-pre-wrap">{article.content}</p>
            </div>

             {article.imageUrls && article.imageUrls.length > 1 && (
                <div>
                    <h2 className="text-2xl font-bold mb-4">Weitere Bilder</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {article.imageUrls.slice(1).map((url, index) => (
                            <div key={index} className="relative aspect-square w-full overflow-hidden rounded-lg">
                                <Image
                                    src={url}
                                    alt={`${article.title} - Bild ${index + 2}`}
                                    fill
                                    style={{objectFit: "cover"}}
                                    className="bg-muted"
                                />
                            </div>
                        ))}
                    </div>
                </div>
             )}

        </article>
    </div>
  );
}
