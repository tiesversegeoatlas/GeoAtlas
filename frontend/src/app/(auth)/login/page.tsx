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
  FieldError
} from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Globe, ShieldCheck, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(values: LoginFormValues) {
    console.log(values);
    toast.success("Authentication successful", {
      description: "Welcome back, Intelligence Operator."
    });
    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background patterns */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#3b82f61a,transparent_50%)]" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-8 gap-2">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            <Globe className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tighter">GEOATLAS</h1>
          <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest">Operator Terminal</p>
        </div>

        <Card className="bg-card/50 border-border shadow-2xl backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl text-center">Secure Access</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access the intelligence matrix.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Field>
                <FieldLabel htmlFor="email">Email Address</FieldLabel>
                <FieldContent>
                  <Input
                    id="email"
                    placeholder="operator@warwatch.intel"
                    className="bg-background/50 border-border"
                    {...register("email")}
                  />
                  <FieldError errors={[{ message: errors.email?.message }]} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Access Key</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      className="bg-background/50 border-border pr-10"
                      {...register("password")}
                    />
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                  <FieldError errors={[{ message: errors.password?.message }]} />
                </FieldContent>
              </Field>

              <Button type="submit" className="w-full h-11 font-bold tracking-wide mt-2" disabled={isSubmitting}>
                AUTHORIZE SESSION
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 border-t border-border mt-4 pt-6">
            <div className="text-center text-xs text-muted-foreground">
              Don&apos;t have an assignment yet?{" "}
              <Link href="/register" className="text-primary hover:underline font-bold">
                Apply for Access
              </Link>
            </div>
            <div className="flex items-center gap-2 justify-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-50">
              <ShieldCheck className="w-3 h-3" />
              End-to-End Encryption Enabled
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
