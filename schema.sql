--
-- PostgreSQL database dump
--

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;

--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner:
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';

SET default_tablespace = '';
SET default_table_access_method = heap;

--
-- Name: problem_photos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.problem_photos (
    id integer NOT NULL,
    problem_id integer NOT NULL,
    photo_path text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE public.problem_photos OWNER TO postgres;

CREATE SEQUENCE public.problem_photos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.problem_photos_id_seq OWNER TO postgres;
ALTER SEQUENCE public.problem_photos_id_seq OWNED BY public.problem_photos.id;

--
-- Name: problems; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.problems (
    id integer NOT NULL,
    type character varying(50) NOT NULL,
    description text,
    status character varying(30) DEFAULT 'new'::character varying,
    priority character varying(20) DEFAULT 'medium'::character varying,
    location public.geometry(Point,4326),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp without time zone,
    resolution_comment text,
    address text,
    landmark text
);

ALTER TABLE public.problems OWNER TO postgres;

CREATE SEQUENCE public.problems_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.problems_id_seq OWNER TO postgres;
ALTER SEQUENCE public.problems_id_seq OWNED BY public.problems.id;

--
-- Name: problem_photos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.problem_photos ALTER COLUMN id SET DEFAULT nextval('public.problem_photos_id_seq'::regclass);

--
-- Name: problems id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.problems ALTER COLUMN id SET DEFAULT nextval('public.problems_id_seq'::regclass);

--
-- Name: problem_photos problem_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.problem_photos
    ADD CONSTRAINT problem_photos_pkey PRIMARY KEY (id);

--
-- Name: problems problems_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.problems
    ADD CONSTRAINT problems_pkey PRIMARY KEY (id);

--
-- Name: problem_photos problem_photos_problem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.problem_photos
    ADD CONSTRAINT problem_photos_problem_id_fkey FOREIGN KEY (problem_id) REFERENCES public.problems(id) ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--
