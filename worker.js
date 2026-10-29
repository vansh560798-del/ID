/**
 * Cloudflare Worker for St. Arnold's ID Portal
 * Commits uploaded PDF files to the GitHub repository configured through Worker environment variables
 * File destination: /uploads/{class}/{timestamp}_{filename}
 * 
 * Required Cloudflare Worker Secret:
 * - GITHUB_TOKEN: Personal Access Token (classic: `repo` scope OR fine-grained: Read and Write access to Contents)
 * 
 * Configurable Environment Variables (optional, defaults provided):
 * - REPO_OWNER: "your GitHub username"
 * - REPO_NAME: "your repository name"
 * - REPO_BRANCH: "main"
 */

export default {
  async fetch(request, env) {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);

    // 2. Health check route
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return new Response(JSON.stringify({ status: 'ok', service: "St. Arnold's Portal API Worker" }), {
        status: 200,
        headers: corsHeaders(),
      });
    }

    // 3. PDF Upload Endpoint: POST /api/upload-pdf (also supports /api/upload)
    if (request.method === 'POST' && (url.pathname === '/api/upload-pdf' || url.pathname === '/api/upload')) {
      try {
        const body = await request.json().catch(() => null);
        if (!body) {
          return new Response(JSON.stringify({ error: 'Invalid JSON request body' }), {
            status: 400,
            headers: corsHeaders(),
          });
        }

        const cls = body.cls !== undefined ? body.cls : (body.class !== undefined ? body.class : 0);
        const origName = body.fileName || body.name || body.filename || ('document_' + Date.now() + '.pdf');
        // Clean filename and prepend timestamp for collision avoidance
        const cleanName = Date.now() + '_' + origName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const base64Content = body.base64 || body.content || body.fileBase64;

        if (!base64Content) {
          return new Response(JSON.stringify({ error: 'Missing base64 PDF content' }), {
            status: 400,
            headers: corsHeaders(),
          });
        }

        const owner = env.REPO_OWNER;
        const repo = env.REPO_NAME;
        if (!owner || !repo) {
          return new Response(JSON.stringify({ error: 'Set REPO_OWNER and REPO_NAME Worker variables before enabling PDF uploads.' }), { status: 500, headers: corsHeaders() });
        }
        const branch = env.REPO_BRANCH || 'main';
        const token = env.GITHUB_TOKEN;

        if (!token) {
          return new Response(JSON.stringify({ 
            error: 'GITHUB_TOKEN secret is not configured in Cloudflare Worker settings.' 
          }), {
            status: 500,
            headers: corsHeaders(),
          });
        }

        const filePath = `uploads/${cls}/${cleanName}`;
        const ghApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

        // Commit file to GitHub via REST API
        const ghResponse = await fetch(ghApiUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'Cloudflare-Worker-StArnolds',
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Upload PDF for Class ${cls}: ${cleanName}`,
            content: base64Content,
            branch: branch,
          }),
        });

        const ghData = await ghResponse.json().catch(() => ({}));

        if (!ghResponse.ok) {
          return new Response(JSON.stringify({
            error: ghData.message || ('GitHub API returned status ' + ghResponse.status),
            details: ghData,
          }), {
            status: ghResponse.status,
            headers: corsHeaders(),
          });
        }

        // Return the raw GitHub content URL for instant PDF viewing/downloading
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;

        return new Response(JSON.stringify({
          success: true,
          rawUrl: rawUrl,
          fileUrl: rawUrl,
          path: filePath,
          fileName: cleanName,
        }), {
          status: 200,
          headers: corsHeaders(),
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || 'Worker internal error' }), {
          status: 500,
          headers: corsHeaders(),
        });
      }
    }

    // 4. KV Items: POST /kv-items
    if (request.method === 'POST' && (url.pathname === '/kv-items' || url.pathname === '/api/kv-items')) {
      try {
        if (!env.ITEMS_KV) {
          return new Response(JSON.stringify({ error: 'ITEMS_KV namespace binding not configured in Worker' }), {
            status: 500,
            headers: corsHeaders(),
          });
        }
        const item = await request.json().catch(() => null);
        if (!item) {
          return new Response(JSON.stringify({ error: 'Invalid JSON request body' }), {
            status: 400,
            headers: corsHeaders(),
          });
        }
        const key = String(item.ts || Date.now());
        await env.ITEMS_KV.put(key, JSON.stringify(item));
        return new Response(JSON.stringify({ success: true, key: key, id: 'kv-' + key }), {
          status: 200,
          headers: corsHeaders(),
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || 'KV write failed' }), {
          status: 500,
          headers: corsHeaders(),
        });
      }
    }

    // 5. KV Items: GET /kv-items
    if (request.method === 'GET' && (url.pathname === '/kv-items' || url.pathname === '/api/kv-items')) {
      try {
        if (!env.ITEMS_KV) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: corsHeaders(),
          });
        }
        const listResult = await env.ITEMS_KV.list();
        const items = await Promise.all(
          listResult.keys.map(async k => {
            const raw = await env.ITEMS_KV.get(k.name);
            if (!raw) return null;
            try {
              const parsed = JSON.parse(raw);
              return { id: 'kv-' + (parsed.ts || k.name), ...parsed };
            } catch {
              return null;
            }
          })
        );
        return new Response(JSON.stringify(items.filter(Boolean)), {
          status: 200,
          headers: corsHeaders(),
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || 'KV read failed' }), {
          status: 500,
          headers: corsHeaders(),
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404,
      headers: corsHeaders(),
    });
  },
};

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
