
'use client';

import {
  useDoc,
  useFirestore,
  useMemoFirebase,
  useUser,
  errorEmitter,
  FirestorePermissionError,
} from '@/firebase';
import type { NewsArticle } from '@/lib/types';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { Loader2, Wand2, Newspaper } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { summarize } from '@/ai/flows/summarize-flow';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';

export default function NewsArticlePage() {
  const { id } = useParams();
  const firestore = useFirestore();
  const { isAdmin } = useUser();
  const { toast } = useToast();
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const articleId = typeof id === 'string' ? id : '';

  const articleRef = useMemoFirebase(
    () => (firestore && articleId ? doc(firestore, 'news', articleId) : null),
    [firestore, articleId]
  );

  const { data: article, isLoading } = useDoc<NewsArticle>(articleRef);

  const handleGenerateSummary = async () => {
    if (!firestore || !article || !article.id) return;

    setIsGeneratingSummary(true);

    try {
      const result = await summarize(article.content);
      const docRef = doc(firestore, 'news', article.id);
      await updateDoc(docRef, { summary: result });
      toast({
        title: 'Zusammenfassung erstellt',
        description: 'Die KI-Zusammenfassung wurde für den Artikel gespeichert.',
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Fehler bei der Zusammenfassung',
        description:
          'Die KI konnte keine Zusammenfassung erstellen. Bitte versuchen Sie es erneut.',
      });
    } finally {
      setIsGeneratingSummary(false);
    }
  };


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

  const canGenerateSummary = isAdmin && !article.summary;

  return (
    <div className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
        <article className="space-y-8">
            {article.imageUrls && article.imageUrls.length > 0 && (
                <div className="relative h-96 w-full overflow-hidden rounded-lg">
                <Image
                    src={article.imageUrls[0]}
                    alt={article.title}
                    layout="fill"
                    objectFit="cover"
                    className="bg-muted"
                />
                </div>
            )}
            
            <div className="space-y-2 text-center">
                <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl font-headline">{article.title}</h1>
                <p className="text-muted-foreground">
                    Veröffentlicht am{' '}
                    {article.createdAt instanceof Timestamp
                        ? article.createdAt.toDate().toLocaleDateString('de-DE', {
                            year: 'numeric', month: 'long', day: 'numeric'
                        })
                        : 'N/A'}
                </p>
            </div>
            
            {(article.summary || canGenerateSummary) && (
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                       <div className="space-y-1">
                         <CardTitle>Zusammenfassung</CardTitle>
                         <CardDescription>Kurz und bündig von unserer KI.</CardDescription>
                       </div>
                        {canGenerateSummary && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleGenerateSummary}
                                disabled={isGeneratingSummary}
                            >
                                {isGeneratingSummary ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Wand2 className="mr-2 h-4 w-4" />
                                )}
                                Generieren
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent>
                        {isGeneratingSummary ? (
                             <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Zusammenfassung wird erstellt...</span>
                            </div>
                        ) : article.summary ? (
                             <p className="text-muted-foreground">{article.summary}</p>
                        ): (
                            <p className="text-sm text-muted-foreground italic">Noch keine Zusammenfassung vorhanden. Ein Admin kann eine erstellen.</p>
                        )}
                    </CardContent>
                </Card>
            )}


            <div className="prose prose-lg dark:prose-invert max-w-none mx-auto break-words">
                <p>{article.content}</p>
            </div>

             {article.imageUrls && article.imageUrls.length > 1 && (
                <div>
                    <h2 className="text-2xl font-bold mb-4">Weitere Bilder</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {article.imageUrls.slice(1).map((url, index) => (
                            <div key={index} className="relative h-48 w-full overflow-hidden rounded-lg">
                                <Image
                                    src={url}
                                    alt={`${article.title} - Bild ${index + 2}`}
                                    layout="fill"
                                    objectFit="cover"
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
