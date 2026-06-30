"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loginPortalAccount } from "@/lib/portal-api";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type Values = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: Values) => {
    try {
      await loginPortalAccount(values);
      toast.success("Signed in");
      router.replace("/portal");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in.");
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">GeoAtlas commercial API</p>
          <h1 className="text-5xl font-bold tracking-tight">Sign in to your developer account.</h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Manage your API keys, free-tier access, usage limits, and account billing from one portal.
          </p>
        </div>
        <Card className="border-border/70 shadow-xl">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Use your email and password to access the developer dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <FieldContent>
                  <Input id="email" {...form.register("email")} placeholder="you@company.com" />
                  <FieldError errors={[{ message: form.formState.errors.email?.message }]} />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <FieldContent>
                  <Input id="password" type="password" {...form.register("password")} placeholder="••••••••" />
                  <FieldError errors={[{ message: form.formState.errors.password?.message }]} />
                </FieldContent>
              </Field>
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                Sign in
              </Button>
            </form>
            <p className="mt-4 text-sm text-muted-foreground">
              New here?{" "}
              <Link href="/register" className="font-medium text-primary hover:underline">
                Create an account
              </Link>
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
