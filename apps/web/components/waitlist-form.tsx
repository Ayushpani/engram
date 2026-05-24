"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LabeledInput } from "@ui/input/labeled-input";
import { Button } from "@ui/components/button";
import { Logo } from "@ui/assets/Logo";
import { Check } from "lucide-react";

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
        className="flex flex-col items-center justify-center py-6 px-4 text-center space-y-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <Check className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-[17px] font-medium text-white">You're on the list</h3>
          <p className="text-sm text-white/60">
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
          disabled: state === "loading"
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
              <label className="text-xs font-medium text-white/60 mb-2 block ml-1">
                What are you building? <span className="text-white/30">(optional but prioritized)</span>
              </label>
              <textarea
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                placeholder="I'm building an AI assistant for my team..."
                className="w-full min-h-[80px] rounded-xl border border-[#2A2D35] bg-[#0D0F14] px-4 py-3 text-sm text-white placeholder:text-[#525D6E] focus:outline-none focus:border-[#4BA0FA]/50 transition-colors resize-none"
                disabled={state === "loading"}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        className="flex justify-center items-center w-full h-[44px] relative gap-3 p-2 rounded-xl mt-2 cursor-pointer"
        style={{
          background: "linear-gradient(182.37deg, #0ff0d2 -91.53%, #5bd3fb -67.8%, #1e0ff0 95.17%)",
          boxShadow: "1px 1px 2px 0px #1A88FF inset, 0 2px 10px 0 rgba(5, 1, 0, 0.20)",
        }}
        disabled={state === "loading"}
        type="submit"
      >
        <Logo className="size-4" />
        <span className="font-medium text-[14px]">
            {state === "loading" ? "Requesting access..." : "Request beta access"}
        </span>
      </Button>

      {state === "error" && (
        <p className="text-[#C73B1B] text-sm text-center mt-2">
          {errorMessage} Or email ayush@engram.ai directly.
        </p>
      )}
    </form>
  );
}
