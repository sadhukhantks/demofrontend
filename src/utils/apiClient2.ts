import { useState, useEffect } from "react";
import axios, { AxiosResponse } from "axios";

type FetchResult<T = any> = {
    data: T | null;
    error: string | null;
    status: number;
};

// Regular function for direct API calls
export const fetchWithCookie = async <T = any>(
    url: string,
    method: string = "GET",
    body?: unknown,
): Promise<FetchResult<T>> => {
    try {
        const response: AxiosResponse<T> = await axios({
            url,
            method,
            headers: {
                "Content-Type": "application/json",
            },
            withCredentials: true,
            data: body,
            validateStatus: (status) => status >= 200 && status < 500,
        });
        const isSuccess = response.status >= 200 && response.status < 300;
        if (!isSuccess) {
            let message: string | null = null;
            const payload = response.data as unknown;
            if (payload && typeof payload === "object") {
                const detail = (payload as { detail?: unknown }).detail;
                if (typeof detail === "string") {
                    message = detail;
                } else if (detail && typeof detail === "object") {
                    const detailMessage = (detail as { message?: unknown }).message;
                    if (typeof detailMessage === "string") {
                        message = detailMessage;
                    }
                }
            }
            if (!message) {
                message = `Request failed with status ${response.status}`;
            }
            return { data: null, error: message, status: response.status };
        }

        return { data: response.data ?? null, error: null, status: response.status };
    } catch (err: unknown) {
        // Axios rejects for 5xx (validateStatus caps at < 500), so the real
        // backend error lands on err.response.data.detail — surface it instead
        // of the opaque "Request failed with status code 500".
        let message: string;
        let status = 0;
        if (axios.isAxiosError(err)) {
            status = err.response?.status ?? 0;
            const detail = (err.response?.data as { detail?: unknown } | undefined)
                ?.detail;
            message = typeof detail === "string" ? detail : err.message;
        } else {
            message = err instanceof Error ? err.message : String(err);
        }
        console.error(`Error in fetchWithCookie for ${url}:`, message);
        return { data: null, error: message, status };
    }
};

// Hook version for components
export const useDataWithCookie = <T = any>(
    url: string,
    method: "GET" | "POST" = "GET",
    body?: unknown,
) => {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        let mounted = true;

        const fetchData = async () => {
            setLoading(true);
            const result = await fetchWithCookie<T>(url, method, body);
            if (!mounted) return;
            setData(result.data);
            setError(result.error);
            setLoading(false);
        };

        fetchData();
        return () => {
            mounted = false;
        };
        // stringify body so identity changes don't retrigger unnecessarily
    }, [url, method, JSON.stringify(body ?? null)]);

    return { data, error, loading } as const;
};

export default useDataWithCookie;