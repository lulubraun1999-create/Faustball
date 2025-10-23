
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function VerwaltungGruppenPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <span className="text-2xl font-headline">Verwaltung: Gruppen</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50 p-12 text-center">
            <h2 className="text-xl font-semibold">Gruppenübersicht</h2>
            <p className="mt-2 max-w-md text-muted-foreground">
              Dieser Bereich ist in Entwicklung. Hier können Sie bald die verschiedenen Gruppen und Teams einsehen.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
