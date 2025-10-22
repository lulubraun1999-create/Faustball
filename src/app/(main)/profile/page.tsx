import {
  ProfileForm,
  PasswordForm,
  EmailForm,
  DeleteAccountSection,
} from "@/components/profile-forms";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type ProfilePageProps = {
  searchParams: { [key: string]: string | string[] | undefined };
};

export default function ProfilePage({ searchParams }: ProfilePageProps) {
  const view = searchParams.view || "data";

  const renderView = () => {
    switch (view) {
      case "password":
        return <PasswordForm />;
      case "email":
        return <EmailForm />;
      case "delete":
        return <DeleteAccountSection />;
      case "data":
      default:
        return <ProfileForm />;
    }
  };

  const getTitle = () => {
    switch (view) {
      case "password":
        return "Passwort ändern";
      case "email":
        return "E-Mail ändern";
      case "delete":
        return "Konto löschen";
      case "data":
      default:
        return "Daten ändern";
    }
  };

  const getDescription = () => {
     switch (view) {
      case "password":
        return "Aktualisieren Sie Ihr Passwort für mehr Sicherheit.";
      case "email":
        return "Ändern Sie die mit Ihrem Konto verknüpfte E-Mail-Adresse.";
      case "delete":
        return "Löschen Sie Ihr Konto und alle zugehörigen Daten endgültig.";
      case "data":
      default:
        return "Verwalten Sie Ihre persönlichen Informationen und Kontaktdaten.";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline text-2xl">{getTitle()}</CardTitle>
        <CardDescription>{getDescription()}</CardDescription>
      </CardHeader>
      <CardContent>{renderView()}</CardContent>
    </Card>
  );
}
