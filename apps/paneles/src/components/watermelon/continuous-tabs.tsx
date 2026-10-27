"use client";

import { useState, useEffect, useId, type FC } from "react";
import { motion, LayoutGroup } from "motion/react";

/* ---------- Types ---------- */
interface TabItem {
    id: string;
    label: string;
}

interface ContinuousTabsProps {
    tabs?: TabItem[];
    defaultActiveId?: string;
    onChange?: (id: string) => void;
    /** "sm" para barras y filtros. */
    size?: "sm" | "md";
}

/* ---------- Defaults ---------- */
const DEFAULT_TABS: TabItem[] = [
    { id: "home", label: "Home" },
    { id: "interactions", label: "Interactions" },
    { id: "resources", label: "Resources" },
    { id: "docs", label: "Docs" },
];

export const ContinuousTabs: FC<ContinuousTabsProps> = ({
    tabs = DEFAULT_TABS,
    defaultActiveId = "home",
    onChange,
    size = "md",
}) => {
    const pillId = useId();
    const [active, setActive] = useState<string>(defaultActiveId);
    const [isMounted, setIsMounted] = useState<boolean>(false);

    useEffect(() => {
        requestAnimationFrame(() => setIsMounted(true));
    }, []);

    const handleChange = (id: string) => {
        setActive(id);
        onChange?.(id);
    };

    if (!isMounted) return null;

    return (
        <LayoutGroup>
            <nav
                className={`
          relative flex w-fit max-w-full items-center gap-0.5 overflow-x-auto no-scrollbar sm:gap-1 ${size === "sm" ? "p-1" : "p-1 sm:p-1.5"}
            rounded-full
            border border-border bg-card
            shadow-[inset_0_-2px_4px_rgba(33,19,13,0.06),0_4px_12px_rgba(33,19,13,0.04)]
            transition-all duration-300
          `}
            >
                {tabs.map((tab) => {
                    const isActive = active === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleChange(tab.id)}
                            type="button"
                            className={`relative shrink-0 rounded-full outline-none ${size === "sm" ? "px-3 py-1.5" : "px-4 py-2 sm:px-6 sm:py-3"}`}
                        >
                            {/* Active pill */}
                            {isActive && (
                                <motion.div
                                    layoutId={pillId}
                                    transition={{
                                        type: "spring",
                                        stiffness: 380,
                                        damping: 30,
                                        mass: 0.9,
                                    }}
                                    className="
                      absolute inset-0 rounded-full
                      bg-primary
                      shadow-xs
                    "
                                />
                            )}

                            {/* Text */}
                            <motion.span
                                layout="position"
                                className={`relative z-10 whitespace-nowrap ${size === "sm" ? "text-sm" : "text-sm sm:text-base"} font-semibold transition-colors duration-200
                    ${isActive
                                        ? "text-primary-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                    }
                  `}
                            >
                                {tab.label}
                            </motion.span>
                        </button>
                    );
                })}
            </nav>
        </LayoutGroup>
    );
};