
'use client';

import { AdminGuard } from '@/components/admin-guard';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  errorEmitter,
  FirestorePermissionError,
} from '@/firebase';
import type { NewsArticle } from '@/lib/types';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { Loader2, Plus, Trash2, Edit, Newspaper } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


const newsArticleSchema = z.object({
  title: z.string().min(1, 'Titel ist erforderlich.'),
  content: z.string().min(1, 'Inhalt ist erforderlich.'),
  imageUrls: z.string().optional(),
});

type NewsArticleFormValues = z.infer<typeof newsArticleSchema>;

function AdminNewsPageContent() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const firestore = useFirestore();

  const newsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'news') : null),
    [firestore]
  );
  const { data: newsArticles, isLoading: isLoadingNews } =
    useCollection<NewsArticle>(newsRef);

  const form = useForm<NewsArticleFormValues>({
    resolver: zodResolver(newsArticleSchema),
    defaultValues: {
      title: '',
      content: '',
      imageUrls: '',
    },
  });

  const sortedNews = useMemo(() => {
    if (!newsArticles) return [];
    return [...newsArticles].sort(
      (a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()
    );
  }, [newsArticles]);

  const handleAddNew = () => {
    form.reset();
    setSelectedArticle(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (article: NewsArticle) => {
    setSelectedArticle(article);
    form.reset({
      title: article.title,
      content: article.content,
      imageUrls: article.imageUrls.join('\n'),
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: NewsArticleFormValues) => {
    if (!firestore) return;

    const imageUrls = data.imageUrls
      ? data.imageUrls.split('\n').filter((url) => url.trim() !== '')
      : [];

    const articleData = {
      title: data.title,
      content: data.content,
      imageUrls: imageUrls,
    };

    try {
      if (selectedArticle) {
        // Update existing article
        const docRef = doc(firestore, 'news', selectedArticle.id!);
        await updateDoc(docRef, articleData);
        toast({ title: 'Artikel erfolgreich aktualisiert.' });
      } else {
        // Create new article
        await addDoc(collection(firestore, 'news'), {
          ...articleData,
          createdAt: serverTimestamp(),
        });
        toast({ title: 'Neuer Artikel erfolgreich erstellt.' });
      }
      form.reset();
      setIsDialogOpen(false);
      setSelectedArticle(null);
    } catch (error) {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: selectedArticle ? `news/${selectedArticle.id}` : 'news',
          operation: selectedArticle ? 'update' : 'create',
          requestResourceData: articleData,
        })
      );
    }
  };

  const handleDeleteArticle = async (articleId: string) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'news', articleId));
      toast({ title: 'Artikel gelöscht.' });
    } catch (error) {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: `news/${articleId}`,
          operation: 'delete',
        })
      );
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <Newspaper className="h-8 w-8 text-primary" />
          <span className="font-headline">News verwalten</span>
        </h1>
        <Button onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          Artikel hinzufügen
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedArticle ? 'Artikel bearbeiten' : 'Neuen Artikel erstellen'}
            </DialogTitle>
            <DialogDescription>
              Füllen Sie die Felder aus, um einen Artikel zu erstellen oder zu bearbeiten.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6 p-4"
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Titel</FormLabel>
                    <FormControl>
                      <Input placeholder="Einprägsamer Titel..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inhalt</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Schreiben Sie hier Ihren Artikel..."
                        className="min-h-[200px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="imageUrls"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bild-URLs</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Fügen Sie eine URL pro Zeile ein"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Abbrechen
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {selectedArticle ? 'Änderungen speichern' : 'Artikel veröffentlichen'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Bestehende Artikel</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingNews ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Bild</TableHead>
                  <TableHead>Titel</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedNews.length > 0 ? (
                  sortedNews.map((article) => (
                    <TableRow key={article.id}>
                      <TableCell>
                        <div className="relative h-16 w-16 rounded-md bg-muted">
                          {article.imageUrls && article.imageUrls.length > 0 && (
                            <Image
                              src={article.imageUrls[0]}
                              alt={article.title}
                              layout="fill"
                              objectFit="cover"
                              className="rounded-md"
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate font-medium">{article.title}</TableCell>
                      <TableCell>
                        {article.createdAt instanceof Timestamp
                          ? article.createdAt.toDate().toLocaleDateString('de-DE')
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(article)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                             <p>Artikel bearbeiten</p>
                          </TooltipContent>
                        </Tooltip>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                             <Tooltip>
                               <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                               </TooltipTrigger>
                               <TooltipContent>
                                <p>Artikel löschen</p>
                               </TooltipContent>
                             </Tooltip>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Sind Sie sicher?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Diese Aktion kann nicht rückgängig gemacht werden.
                                Der Artikel "{article.title}" wird dauerhaft gelöscht.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteArticle(article.id!)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Löschen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      Noch keine Artikel erstellt.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminNewsPage() {
  return (
    <AdminGuard>
      <AdminNewsPageContent />
    </AdminGuard>
  );
}
