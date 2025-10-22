import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-primary" />
            <span className="text-2xl font-headline">Team-Chat</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50 p-12 text-center">
            <h2 className="text-xl font-semibold">Team-Chat in Kürze verfügbar</h2>
            <p className="mt-2 max-w-md text-muted-foreground">
              Hier kannst du dich bald mit deinen Teamkollegen austauschen.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
