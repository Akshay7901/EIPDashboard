import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const SigningComplete = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 text-green-600 mx-auto" />
          <h1 className="text-2xl font-semibold">Thank you</h1>
          <p className="text-muted-foreground">
            Your contract has been signed successfully. Ethics Press will be in touch with next steps.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default SigningComplete;