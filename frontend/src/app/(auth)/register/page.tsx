"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldContent,
  FieldError,
  FieldDescription
} from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Globe, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const registerSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Invalid email address"),
  organization: z.string().min(2, "Organization is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      organization: "",
      password: "",
    },
  });

  function onSubmit(values: RegisterFormValues) {
    console.log(values);
    toast.success("Application submitted", {
      description: "Your credentials will be reviewed by the security council."
    });
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,#3b82f61a,transparent_50%)]" />
      
      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-6 gap-2">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            <Globe className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tighter">WARWATCH</h1>
        </div>

        <Card className="bg-card/50 border-border shadow-2xl backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl text-center">Operator Enrollment</CardTitle>
            <CardDescription className="text-center">
              Request credentials for the geopolitical monitoring platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Field>
                <FieldLabel htmlFor="fullName">Full Legal Name</FieldLabel>
                <FieldContent>
                  <Input id="fullName" placeholder="John Doe" className="bg-background/50 border-border" {...register("fullName")} />
                  <FieldError errors={[{ message: errors.fullName?.message }]} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="email">Professional Email</FieldLabel>
                <FieldContent>
                  <Input id="email" placeholder="john@un.org" className="bg-background/50 border-border" {...register("email")} />
                  <FieldError errors={[{ message: errors.email?.message }]} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="organization">Organization / Agency</FieldLabel>
                <FieldContent>
                  <Input id="organization" placeholder="e.g., Reuters, NATO, ICRC" className="bg-background/50 border-border" {...register("organization")} />
                  <FieldError errors={[{ message: errors.organization?.message }]} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <FieldContent>
                  <Input id="password" type="password" placeholder="••••••••" className="bg-background/50 border-border" {...register("password")} />
                  <FieldDescription className="text-[10px]">Must include upper, lower, numeric and symbol.</FieldDescription>
                  <FieldError errors={[{ message: errors.password?.message }]} />
                </FieldContent>
              </Field>

              <Button type="submit" className="w-full h-11 font-bold tracking-wide mt-2" disabled={isSubmitting}>
                <UserPlus className="w-4 h-4 mr-2" /> REQUEST ACCESS
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 border-t border-border mt-4 pt-6">
            <div className="text-center text-xs text-muted-foreground">
              Already have an assignment?{" "}
              <Link href="/login" className="text-primary hover:underline font-bold">
                Return to Login
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
