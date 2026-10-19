// クイズの正解データ（詳細設計書 §5.2・§6.6）。クイズで最初に解答したときに取得する
import type { APIRoute } from 'astro';
import type { Concept } from '../../../content/loader';
import { buildAnswersData } from '../../../build/page-data';
import { conceptPaths } from '../../../build/site';

export const getStaticPaths = () => conceptPaths();

export const GET: APIRoute<{ concept: Concept }> = ({ props }) =>
  new Response(JSON.stringify(buildAnswersData(props.concept)), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
