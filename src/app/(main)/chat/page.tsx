'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  useFirestore,
  useUser,
  useCollection,
  useMemoFirebase,
  errorEmitter,
  FirestorePermissionError,
  useDoc,
  initializeFirebase,
} from '@/firebase';
import {
  collection,
  query,
  orderBy,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare,
  Users,
  Shield,
  Trash2,
  Send,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Group, MemberProfile } from '@/lib/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: any;
}

interface ChatRoom {
  id: string;
  name: string;
  icon: React.ElementType;
}

export default function ChatPage() {
  const { user, userProfile, isAdmin, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const memberProfileRef = useMemoFirebase(
      () => (user ? doc(firestore, 'members', user.uid) : null),
      [firestore, user]
  );
  const { data: memberProfile, isLoading: isLoadingMember } = useDoc<MemberProfile>(memberProfileRef);
  
  const groupsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'groups') : null),
    [firestore]
  );
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const messagesRef = useMemoFirebase(
    () =>
      firestore && selectedRoom
        ? query(
            collection(firestore, 'chats', selectedRoom.id, 'messages'),
            orderBy('createdAt', 'asc')
          )
        : null,
    [firestore, selectedRoom]
  );
  const { data: messages, isLoading: isLoadingMessages } = useCollection<ChatMessage>(messagesRef);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const userTeams = useMemo(() => {
    if (!memberProfile?.teams || !groups) return [];
    const userTeamIds = new Set(memberProfile.teams);
    return groups.filter(g => userTeamIds.has(g.id));
  }, [memberProfile, groups]);

  const chatRooms: ChatRoom[] = useMemo(() => {
    const rooms: ChatRoom[] = [
      { id: 'all', name: 'Alle', icon: Users },
    ];
    if (isAdmin) {
      rooms.push({ id: 'trainers', name: 'Trainer', icon: Shield });
    }
    userTeams.forEach(team => {
        rooms.push({ id: `team_${team.id}`, name: team.name, icon: Users });
    });
    return rooms;
  }, [isAdmin, userTeams]);
  
  useEffect(() => {
    if (!selectedRoom && chatRooms.length > 0) {
      setSelectedRoom(chatRooms[0]);
    }
  }, [chatRooms, selectedRoom]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight });
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedRoom || !newMessage.trim()) return;

    setIsSending(true);
    const content = newMessage.trim();
    const roomId = selectedRoom.id;
    
    // Optimistically clear input
    setNewMessage('');

    try {
        const { firebaseApp } = initializeFirebase();
        const functions = getFunctions(firebaseApp);
        const sendMessageFn = httpsCallable(functions, 'sendMessage');
        
        await sendMessageFn({ roomId, content });

    } catch (error: any) {
        console.error("Error calling sendMessage function:", error);
        // Revert optimistic UI update
        setNewMessage(content);
        // Optionally show a toast to the user
        errorEmitter.emit(
          'permission-error',
          new FirestorePermissionError({
            path: `chats/${roomId}/messages`,
            operation: 'create',
            requestResourceData: { content },
          })
        );
    } finally {
        setIsSending(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!firestore || !selectedRoom) return;
    const docRef = doc(firestore, 'chats', selectedRoom.id, 'messages', messageId);
    
    deleteDoc(docRef).catch((e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        }));
    })
  };

  const isLoading = isUserLoading || isLoadingMember || isLoadingGroups;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto h-[calc(100vh-8rem)] p-4">
      <div className="grid h-full grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-1 h-full flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" />
              Chat-Räume
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-grow p-2">
            <ScrollArea className="h-full">
              <div className="space-y-1">
                {chatRooms.map(room => (
                  <Button
                    key={room.id}
                    variant={selectedRoom?.id === room.id ? 'secondary' : 'ghost'}
                    className="w-full justify-start gap-2"
                    onClick={() => setSelectedRoom(room)}
                  >
                    <room.icon className="h-4 w-4" />
                    {room.name}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="md:col-span-3 h-full flex flex-col">
          <CardHeader>
            <CardTitle>{selectedRoom?.name || 'Chat'}</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow overflow-hidden p-0">
             <ScrollArea className="h-full" ref={scrollAreaRef}>
                 <div className="p-6 space-y-4">
                    {isLoadingMessages ? (
                        <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin text-primary"/></div>
                    ) : messages && messages.length > 0 ? (
                        messages.map(msg => (
                            <div key={msg.id} className={cn("flex items-start gap-3 group", msg.userId === user?.uid && "flex-row-reverse")}>
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback>
                                        {msg.userName.split(' ').map(n => n[0]).join('')}
                                    </AvatarFallback>
                                </Avatar>
                                <div className={cn("rounded-lg px-3 py-2 max-w-sm", msg.userId === user?.uid ? "bg-primary text-primary-foreground" : "bg-muted")}>
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-semibold">{msg.userName}</p>
                                        {(msg.userId === user?.uid || isAdmin) && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className={cn("h-6 w-6 opacity-0 group-hover:opacity-100", msg.userId === user?.uid ? "hover:bg-primary/80" : "hover:bg-muted-foreground/20")}>
                                                        <Trash2 className="h-3 w-3"/>
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Nachricht löschen?</AlertDialogTitle>
                                                        <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteMessage(msg.id)} className="bg-destructive hover:bg-destructive/90">Löschen</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                    </div>
                                    <p className="text-sm break-words">{msg.content}</p>
                                    <p className={cn("text-xs mt-1", msg.userId === user?.uid ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                        {msg.createdAt ? format(msg.createdAt.toDate(), 'dd.MM.yy HH:mm', { locale: de }) : '...'}
                                    </p>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-muted-foreground p-8">Keine Nachrichten in diesem Raum.</div>
                    )}
                </div>
             </ScrollArea>
          </CardContent>
          <CardFooter className="p-4 border-t">
            <form onSubmit={handleSendMessage} className="w-full flex items-center gap-2">
                <Input 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={`Nachricht in #${selectedRoom?.name || 'Chat'}...`}
                    autoComplete="off"
                    disabled={isSending}
                />
                <Button type="submit" size="icon" disabled={!newMessage.trim() || isSending}>
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4" />}
                </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
