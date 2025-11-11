
'use client';

import {
  useCollection,
  useFirestore,
  useMemoFirebase,
} from '@/firebase';
import type { NewsArticle } from '@/lib/types';
import { collection, Timestamp } from 'firebase/firestore';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Newspaper, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useMemo } from 'react';
import Link from 'next/link';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

export default function VerwaltungNewsPage() {
  const firestore = useFirestore();
  const newsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'news') : null),
    [firestore]
  );
  const { data: newsArticles, isLoading: isLoadingNews } =
    useCollection<NewsArticle>(newsRef);

  const sortedNews = useMemo(() => {
    if (!newsArticles) return [];
    return [...newsArticles].sort(
      (a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()
    );
  }, [newsArticles]);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <Newspaper className="h-8 w-8 text-primary" />
          <span className="font-headline">News</span>
        </h1>
      </div>

      {isLoadingNews ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : sortedNews.length > 0 ? (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {sortedNews.map((article) => (
            <Card key={article.id} className="flex flex-col overflow-hidden">
              {article.imageUrls && article.imageUrls.length > 0 && (
                article.imageUrls.length > 1 ? (
                  <Carousel className="w-full">
                    <CarouselContent>
                      {article.imageUrls.map((url, index) => (
                        <CarouselItem key={index}>
                          <div className="relative h-48 w-full">
                            <Image
                              src={url}
                              alt={`${article.title} - Bild ${index + 1}`}
                              layout="fill"
                              objectFit="cover"
                              className="bg-muted"
                            />
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <CarouselPrevious className="left-2" />
                    <CarouselNext className="right-2" />
                  </Carousel>
                ) : (
                  <div className="relative h-48 w-full">
                    <Image
                      src={article.imageUrls[0]}
                      alt={article.title}
                      layout="fill"
                      objectFit="cover"
                      className="bg-muted"
                    />
                  </div>
                )
              )}
              <CardHeader>
                <CardTitle>{article.title}</CardTitle>
                <CardDescription>
                  Veröffentlicht am{' '}
                  {article.createdAt instanceof Timestamp
                    ? article.createdAt.toDate().toLocaleDateString('de-DE')
                    : 'N/A'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-sm text-muted-foreground line-clamp-4">
                  {article.content}
                </p>
              </CardContent>
              <CardFooter>
                 <Link href={`/verwaltung/news/${article.id}`} passHref className="w-full">
                  <Button variant="secondary" className="w-full">
                    Mehr lesen
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50 p-12 text-center">
          <h2 className="text-xl font-semibold">Keine Nachrichten vorhanden</h2>
          <p className="mt-2 max-w-md text-muted-foreground">
            Es wurden noch keine Artikel veröffentlicht. Schauen Sie bald wieder
            vorbei!
          </p>
        </div>
      )}
    </div>
  );
}
