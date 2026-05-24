"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LabeledInput } from "@ui/input/labeled-input";
import { Button } from "@ui/components/button";
import { Check } from "lucide-react";
import Image from "next/image";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [useCase, setUseCase] = useState("");
  const [state, setState] = useState<"idle" | "focused" | "loading" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!email) return;
    
    setState("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, useCase }),
      });
      
      if (res.ok) {
        setState("done");
      } else {
        const data = await res.json();
        setState("error");
        setErrorMessage(data.error || "Something went wrong.");
      }
    } catch (err) {
      setState("error");
      setErrorMessage("Network error. Please try again.");
    }
  }

  if (state === "done") {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-6 px-4 text-center space-y-4 rounded-2xl bg-orange-50 border border-orange-100"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-500">
          <Check className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-[17px] font-medium text-slate-800">You're on the list</h3>
          <p className="text-sm text-slate-500">
            Check your email — Ayush will be in touch within 48 hours.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
      <LabeledInput
        inputPlaceholder="your@email.com"
        inputProps={{
          type: "email",
          value: email,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value),
          onFocus: () => {
            if (state === "idle" || state === "error") setState("focused");
          },
          required: true,
          disabled: state === "loading",
          className: "bg-white border-slate-200 text-slate-800 focus:border-orange-500 focus:ring-orange-500/20 shadow-sm transition-all"
        }}
        inputType="email"
      />

      <AnimatePresence>
        {(state === "focused" || state === "loading" || state === "error" || useCase.length > 0) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="pt-2">
              <label className="text-xs font-medium text-slate-500 mb-2 block ml-1">
                What are you building? <span className="text-slate-400">(optional but prioritized)</span>
              </label>
              <textarea
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                placeholder="I'm building an AI assistant for my team..."
                className="w-full min-h-[80px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-colors resize-none shadow-sm"
                disabled={state === "loading"}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        className="flex justify-center items-center w-full h-[44px] relative gap-3 p-2 rounded-xl mt-2 cursor-pointer bg-orange-500 hover:bg-orange-600 text-white font-medium shadow-md shadow-orange-500/20 hover:shadow-lg hover:shadow-orange-500/30 transition-all active:scale-[0.98] border-none"
        disabled={state === "loading"}
        type="submit"
      >
        <span className="font-medium text-[14px]">
            {state === "loading" ? "Requesting access..." : "Request beta access"}
        </span>
      </Button>

      {state === "error" && (
        <p className="text-red-500 text-sm text-center mt-2">
          {errorMessage} Or email ayush@smaran.ai directly.
        </p>
      )}
    </form>
  );
}
