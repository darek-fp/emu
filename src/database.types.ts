/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  graphql_public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
  public: {
    Tables: {
      cancellation_log: {
        Row: {
          canceled_at: string;
          canceled_by: string;
          id: string;
          reservation_id: string;
        };
        Insert: {
          canceled_at?: string;
          canceled_by: string;
          id?: string;
          reservation_id: string;
        };
        Update: {
          canceled_at?: string;
          canceled_by?: string;
          id?: string;
          reservation_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cancellation_log_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
        ];
      };
      operator_sector_assignments: {
        Row: {
          assigned_at: string;
          operator_id: string;
          sector_id: string;
        };
        Insert: {
          assigned_at?: string;
          operator_id: string;
          sector_id: string;
        };
        Update: {
          assigned_at?: string;
          operator_id?: string;
          sector_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "operator_sector_assignments_operator_id_fkey";
            columns: ["operator_id"];
            isOneToOne: false;
            referencedRelation: "operators";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "operator_sector_assignments_sector_id_fkey";
            columns: ["sector_id"];
            isOneToOne: false;
            referencedRelation: "sectors";
            referencedColumns: ["id"];
          },
        ];
      };
      operators: {
        Row: {
          created_at: string;
          deactivated_at: string | null;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deactivated_at?: string | null;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          deactivated_at?: string | null;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      pricing_tiers: {
        Row: {
          base_daily_rate: number;
          created_at: string;
          daily_floor: number;
          discount_steps: Json;
          ended_at: string | null;
          id: string;
          sector_id: string;
          updated_at: string;
        };
        Insert: {
          base_daily_rate: number;
          created_at?: string;
          daily_floor: number;
          discount_steps?: Json;
          ended_at?: string | null;
          id?: string;
          sector_id: string;
          updated_at?: string;
        };
        Update: {
          base_daily_rate?: number;
          created_at?: string;
          daily_floor?: number;
          discount_steps?: Json;
          ended_at?: string | null;
          id?: string;
          sector_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pricing_tiers_sector_fk";
            columns: ["sector_id"];
            isOneToOne: false;
            referencedRelation: "sectors";
            referencedColumns: ["id"];
          },
        ];
      };
      reservations: {
        Row: {
          anonymized_at: string | null;
          arrival_at: string;
          arrived_at: string | null;
          created_at: string;
          created_by_operator_id: string | null;
          customer_name: string;
          departed_at: string | null;
          departure_at: string;
          id: string;
          is_paid: boolean;
          license_plate: string;
          price_override: boolean;
          price_total: number;
          pricing_tier_id: string;
          sector_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          anonymized_at?: string | null;
          arrival_at: string;
          arrived_at?: string | null;
          created_at?: string;
          created_by_operator_id?: string | null;
          customer_name: string;
          departed_at?: string | null;
          departure_at: string;
          id?: string;
          is_paid?: boolean;
          license_plate: string;
          price_override?: boolean;
          price_total: number;
          pricing_tier_id: string;
          sector_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          anonymized_at?: string | null;
          arrival_at?: string;
          arrived_at?: string | null;
          created_at?: string;
          created_by_operator_id?: string | null;
          customer_name?: string;
          departed_at?: string | null;
          departure_at?: string;
          id?: string;
          is_paid?: boolean;
          license_plate?: string;
          price_override?: boolean;
          price_total?: number;
          pricing_tier_id?: string;
          sector_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reservations_created_by_operator_fk";
            columns: ["created_by_operator_id"];
            isOneToOne: false;
            referencedRelation: "operators";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_pricing_tier_fk";
            columns: ["pricing_tier_id"];
            isOneToOne: false;
            referencedRelation: "pricing_tiers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_sector_id_fkey";
            columns: ["sector_id"];
            isOneToOne: false;
            referencedRelation: "sectors";
            referencedColumns: ["id"];
          },
        ];
      };
      sectors: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          spot_count: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          spot_count: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          spot_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      current_user_role: { Args: never; Returns: string };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
