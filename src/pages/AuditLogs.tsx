import { AuditLogs } from "@/components/AuditLogs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
const AuditLogsPage = () => {
  return <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          
        </CardHeader>
        <CardContent>
          <AuditLogs />
        </CardContent>
      </Card>
    </div>;
};
export default AuditLogsPage;