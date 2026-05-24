import { cn } from "@lib/utils"
import { Input } from "@ui/components/input"
import { Label1Regular } from "@ui/text/label/label-1-regular"

interface LabeledInputProps extends React.ComponentProps<"div"> {
	label?: string
	inputType: string
	inputPlaceholder: string
	error?: string | null
	inputProps?: React.ComponentProps<typeof Input>
}

export function LabeledInput({
	inputType,
	inputPlaceholder,
	className,
	error,
	inputProps,
	label,
	...props
}: LabeledInputProps) {
	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			{label && (
				<Label1Regular className="text-foreground">{label}</Label1Regular>
			)}
			<Input
				className={cn(
					"w-full leading-[1.375rem] tracking-[-0.4px] rounded-xl p-4 text-slate-900 bg-white border border-slate-200 shadow-sm focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50 h-[44px]",
					inputProps?.className,
				)}
				placeholder={inputPlaceholder}
				type={inputType}
				{...inputProps}
			/>
			{error && (
				<p className="text-sm text-red-500" role="alert">
					{error}
				</p>
			)}
		</div>
	)
}
