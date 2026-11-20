-- Base schema of the ticketing database, reconstructed from the prod IT catalog (it_ticketing_system)
-- on 2026-11-19 via the read-only DB Query Runner. Used ONLY to create a NEW team database
-- (local IT copy, local/prod Scholarship). Never run against prod it_ticketing_system.
-- Ownership and grants are intentionally omitted (grants come from scripts/grants.mjs).
SET client_min_messages = warning;

CREATE SEQUENCE IF NOT EXISTS public.contacts_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.daily_status_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.messages_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.reminder_tracking_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.system_config_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.ticket_ai_metadata_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.ticket_assignments_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.ticket_audit_log_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.ticket_feedback_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.ticket_tags_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.tickets_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.users_id_seq;
CREATE TABLE IF NOT EXISTS public.contacts (
  id integer DEFAULT nextval('contacts_id_seq'::regclass) NOT NULL,
  email character varying(255) NOT NULL,
  name character varying(255),
  timezone character varying(100) DEFAULT 'UTC'::character varying,
  segment character varying(100),
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.daily_status (
  id integer DEFAULT nextval('daily_status_id_seq'::regclass) NOT NULL,
  summary text NOT NULL,
  severity text NOT NULL,
  metrics jsonb,
  generated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.messages (
  id integer DEFAULT nextval('messages_id_seq'::regclass) NOT NULL,
  ticket_id integer,
  contact_id integer,
  message_id character varying(500),
  in_reply_to character varying(500),
  "references" text,
  conversation_id character varying(500),
  subject character varying(500),
  body text,
  sender_type character varying(50) NOT NULL,
  note_type character varying(50) DEFAULT 'message'::character varying,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reminder_tracking (
  id integer DEFAULT nextval('reminder_tracking_id_seq'::regclass) NOT NULL,
  ticket_id integer,
  reminder_level integer DEFAULT 1 NOT NULL,
  sent_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.system_config (
  id integer DEFAULT nextval('system_config_id_seq'::regclass) NOT NULL,
  config_key character varying(100) NOT NULL,
  config_value text NOT NULL,
  description text,
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ticket_ai_metadata (
  id integer DEFAULT nextval('ticket_ai_metadata_id_seq'::regclass) NOT NULL,
  ticket_id integer,
  summary text,
  intent character varying(100),
  sentiment character varying(50),
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ticket_assignments (
  id integer DEFAULT nextval('ticket_assignments_id_seq'::regclass) NOT NULL,
  ticket_id integer NOT NULL,
  user_id integer,
  assigned_at timestamp with time zone DEFAULT now() NOT NULL,
  ended_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.ticket_audit_log (
  id integer DEFAULT nextval('ticket_audit_log_id_seq'::regclass) NOT NULL,
  ticket_id integer,
  actor_user_id integer,
  actor_email character varying(255) NOT NULL,
  action character varying(50) NOT NULL,
  field character varying(100),
  old_value text,
  new_value text,
  source character varying(20) DEFAULT 'portal'::character varying,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ticket_feedback (
  id integer DEFAULT nextval('ticket_feedback_id_seq'::regclass) NOT NULL,
  ticket_id integer NOT NULL,
  token text NOT NULL,
  agent_id integer,
  contact_id integer,
  sent_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
  rating smallint,
  resolved boolean,
  reasons text[] DEFAULT '{}'::text[] NOT NULL,
  comment text,
  channel text,
  responded_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  low_alert_sent_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.ticket_tags (
  id integer DEFAULT nextval('ticket_tags_id_seq'::regclass) NOT NULL,
  ticket_id integer,
  tag_name character varying(100) NOT NULL
);
CREATE TABLE IF NOT EXISTS public.tickets (
  id integer DEFAULT nextval('tickets_id_seq'::regclass) NOT NULL,
  contact_id integer,
  ticket_owner_id integer,
  subject character varying(500),
  conversation_id character varying(500),
  status character varying(50) DEFAULT 'open'::character varying NOT NULL,
  priority character varying(50) DEFAULT 'medium'::character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_customer_reply_at timestamp with time zone,
  last_agent_reply_at timestamp with time zone,
  ai_summary text,
  ai_intent character varying(100),
  ai_sentiment character varying(50),
  escalated_at timestamp with time zone,
  escalation_level integer DEFAULT 0,
  first_agent_reply_at timestamp with time zone,
  closed_at timestamp with time zone,
  on_hold_since timestamp with time zone,
  total_hold_seconds bigint DEFAULT 0 NOT NULL,
  turnaround_at timestamp with time zone,
  l2_escalated_at timestamp with time zone,
  participant_emails text,
  hold_reason text,
  hold_until timestamp with time zone,
  closed_no_response boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.users (
  id integer DEFAULT nextval('users_id_seq'::regclass) NOT NULL,
  name character varying(255) NOT NULL,
  email character varying(255) NOT NULL,
  timezone character varying(100) DEFAULT 'UTC'::character varying,
  role character varying(50) DEFAULT 'agent'::character varying NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);
ALTER SEQUENCE public.contacts_id_seq OWNED BY public.contacts.id;
ALTER SEQUENCE public.daily_status_id_seq OWNED BY public.daily_status.id;
ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;
ALTER SEQUENCE public.reminder_tracking_id_seq OWNED BY public.reminder_tracking.id;
ALTER SEQUENCE public.system_config_id_seq OWNED BY public.system_config.id;
ALTER SEQUENCE public.ticket_ai_metadata_id_seq OWNED BY public.ticket_ai_metadata.id;
ALTER SEQUENCE public.ticket_assignments_id_seq OWNED BY public.ticket_assignments.id;
ALTER SEQUENCE public.ticket_audit_log_id_seq OWNED BY public.ticket_audit_log.id;
ALTER SEQUENCE public.ticket_feedback_id_seq OWNED BY public.ticket_feedback.id;
ALTER SEQUENCE public.ticket_tags_id_seq OWNED BY public.ticket_tags.id;
ALTER SEQUENCE public.tickets_id_seq OWNED BY public.tickets.id;
ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_email_key UNIQUE (email);
ALTER TABLE public.contacts ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_status ADD CONSTRAINT daily_status_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_status ADD CONSTRAINT daily_status_severity_check CHECK ((severity = ANY (ARRAY['healthy'::text, 'elevated'::text, 'degraded'::text, 'outage'::text])));
ALTER TABLE public.messages ADD CONSTRAINT messages_message_id_key UNIQUE (message_id);
ALTER TABLE public.messages ADD CONSTRAINT messages_note_type_check CHECK (((note_type)::text = ANY ((ARRAY['message'::character varying, 'internal_note'::character varying, 'status_note'::character varying])::text[])));
ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_type_check CHECK (((sender_type)::text = ANY ((ARRAY['customer'::character varying, 'agent'::character varying, 'system'::character varying])::text[])));
ALTER TABLE public.reminder_tracking ADD CONSTRAINT reminder_tracking_pkey PRIMARY KEY (id);
ALTER TABLE public.system_config ADD CONSTRAINT system_config_config_key_key UNIQUE (config_key);
ALTER TABLE public.system_config ADD CONSTRAINT system_config_pkey PRIMARY KEY (id);
ALTER TABLE public.ticket_ai_metadata ADD CONSTRAINT ticket_ai_metadata_pkey PRIMARY KEY (id);
ALTER TABLE public.ticket_assignments ADD CONSTRAINT ticket_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.ticket_audit_log ADD CONSTRAINT ticket_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.ticket_feedback ADD CONSTRAINT ticket_feedback_channel_check CHECK (((channel IS NULL) OR (channel = ANY (ARRAY['link'::text, 'outlook_card'::text]))));
ALTER TABLE public.ticket_feedback ADD CONSTRAINT ticket_feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.ticket_feedback ADD CONSTRAINT ticket_feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE public.ticket_feedback ADD CONSTRAINT ticket_feedback_token_key UNIQUE (token);
ALTER TABLE public.ticket_tags ADD CONSTRAINT ticket_tags_pkey PRIMARY KEY (id);
ALTER TABLE public.ticket_tags ADD CONSTRAINT ticket_tags_ticket_id_tag_name_key UNIQUE (ticket_id, tag_name);
ALTER TABLE public.tickets ADD CONSTRAINT tickets_hold_reason_check CHECK (((hold_reason IS NULL) OR (hold_reason = ANY (ARRAY['business'::text, 'vendor'::text, 'agent'::text]))));
ALTER TABLE public.tickets ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);
ALTER TABLE public.tickets ADD CONSTRAINT tickets_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[])));
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying, 'on_hold'::character varying, 'irrelevant'::character varying])::text[])));
ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['agent'::character varying, 'manager'::character varying, 'senior_manager'::character varying])::text[])));
ALTER TABLE public.messages ADD CONSTRAINT messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);
ALTER TABLE public.messages ADD CONSTRAINT messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
ALTER TABLE public.reminder_tracking ADD CONSTRAINT reminder_tracking_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
ALTER TABLE public.ticket_ai_metadata ADD CONSTRAINT ticket_ai_metadata_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
ALTER TABLE public.ticket_assignments ADD CONSTRAINT ticket_assignments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
ALTER TABLE public.ticket_assignments ADD CONSTRAINT ticket_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public.ticket_audit_log ADD CONSTRAINT ticket_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE public.ticket_audit_log ADD CONSTRAINT ticket_audit_log_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
ALTER TABLE public.ticket_feedback ADD CONSTRAINT ticket_feedback_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users(id);
ALTER TABLE public.ticket_feedback ADD CONSTRAINT ticket_feedback_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);
ALTER TABLE public.ticket_feedback ADD CONSTRAINT ticket_feedback_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
ALTER TABLE public.ticket_tags ADD CONSTRAINT ticket_tags_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);
ALTER TABLE public.tickets ADD CONSTRAINT tickets_ticket_owner_id_fkey FOREIGN KEY (ticket_owner_id) REFERENCES users(id);
CREATE INDEX daily_status_generated_at_idx ON public.daily_status USING btree (generated_at DESC);
CREATE INDEX idx_audit_actor ON public.ticket_audit_log USING btree (actor_user_id);
CREATE INDEX idx_audit_created ON public.ticket_audit_log USING btree (created_at);
CREATE INDEX idx_audit_ticket ON public.ticket_audit_log USING btree (ticket_id);
CREATE INDEX idx_contacts_email ON public.contacts USING btree (email);
CREATE INDEX idx_messages_contact_id ON public.messages USING btree (contact_id);
CREATE INDEX idx_messages_conversation_id ON public.messages USING btree (conversation_id);
CREATE INDEX idx_messages_in_reply_to ON public.messages USING btree (in_reply_to);
CREATE INDEX idx_messages_message_id ON public.messages USING btree (message_id);
CREATE INDEX idx_messages_ticket_id ON public.messages USING btree (ticket_id);
CREATE INDEX idx_reminder_tracking_sent_at ON public.reminder_tracking USING btree (sent_at);
CREATE INDEX idx_reminder_tracking_ticket_id ON public.reminder_tracking USING btree (ticket_id);
CREATE INDEX idx_ticket_ai_metadata_ticket_id ON public.ticket_ai_metadata USING btree (ticket_id);
CREATE INDEX idx_ticket_tags_tag_name ON public.ticket_tags USING btree (tag_name);
CREATE INDEX idx_ticket_tags_ticket_id ON public.ticket_tags USING btree (ticket_id);
CREATE INDEX idx_tickets_contact_id ON public.tickets USING btree (contact_id);
CREATE INDEX idx_tickets_conversation_id ON public.tickets USING btree (conversation_id);
CREATE INDEX idx_tickets_created_at ON public.tickets USING btree (created_at);
CREATE INDEX idx_tickets_on_hold ON public.tickets USING btree (on_hold_since) WHERE ((status)::text = 'on_hold'::text);
CREATE INDEX idx_tickets_owner ON public.tickets USING btree (ticket_owner_id);
CREATE INDEX idx_tickets_priority ON public.tickets USING btree (priority);
CREATE INDEX idx_tickets_status ON public.tickets USING btree (status);
CREATE INDEX idx_tickets_turnaround ON public.tickets USING btree (turnaround_at) WHERE ((turnaround_at IS NOT NULL) AND ((status)::text = 'open'::text));
CREATE INDEX ticket_assignments_ticket_idx ON public.ticket_assignments USING btree (ticket_id);
CREATE INDEX ticket_assignments_user_idx ON public.ticket_assignments USING btree (user_id);
CREATE INDEX ticket_feedback_agent_idx ON public.ticket_feedback USING btree (agent_id, responded_at);
CREATE INDEX ticket_feedback_resp_idx ON public.ticket_feedback USING btree (responded_at);
CREATE INDEX ticket_feedback_ticket_idx ON public.ticket_feedback USING btree (ticket_id);
CREATE OR REPLACE FUNCTION public.track_ticket_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.ticket_owner_id IS NOT DISTINCT FROM OLD.ticket_owner_id THEN
    RETURN NEW;
  END IF;

  UPDATE ticket_assignments SET ended_at = now()
    WHERE ticket_id = NEW.id AND ended_at IS NULL;

  IF NEW.ticket_owner_id IS NOT NULL THEN
    INSERT INTO ticket_assignments (ticket_id, user_id, assigned_at)
      VALUES (NEW.id, NEW.ticket_owner_id, now());
  END IF;

  RETURN NEW;
END $function$
;
CREATE TRIGGER trg_track_assignment AFTER INSERT OR UPDATE OF ticket_owner_id ON public.tickets FOR EACH ROW EXECUTE FUNCTION track_ticket_assignment();
