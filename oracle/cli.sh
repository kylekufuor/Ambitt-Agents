#!/usr/bin/env bash
#
# Oracle CLI — command-line interface to the Ambitt Agents Oracle API
#
# Usage:
#   ./oracle/cli.sh <command> [args]
#
# Commands:
#   health              Fleet health check
#   agents              List all agents with status
#   approve <id>        Approve a pending agent
#   reject <id>         Reject a pending agent
#   pause <id>          Pause an active agent
#   kill <id>           Kill an agent
#   run <id>            Manually run an agent
#   improve             Trigger improvement cycle
#   tools               List available tool catalog
#   tools-status <cid>  Check tool status for a client
#
# Environment:
#   ORACLE_URL  Override the Oracle API URL (default: production)

set -euo pipefail

ORACLE_URL="${ORACLE_URL:-https://ambitt-agents-production.up.railway.app}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m' # No Color

has_jq() { command -v jq &>/dev/null; }

pretty() {
  if has_jq; then
    jq '.' 2>/dev/null || cat
  else
    cat
  fi
}

header() {
  echo -e "\n${BOLD}${CYAN}⚡ Oracle${NC} ${DIM}— ${1}${NC}\n"
}

error() {
  echo -e "${RED}Error:${NC} $1" >&2
  exit 1
}

cmd_health() {
  header "Fleet Health"
  local response
  response=$(curl -sf "${ORACLE_URL}/fleet" 2>&1) || error "Failed to reach Oracle at ${ORACLE_URL}"

  if has_jq; then
    local active pending paused killed stale
    active=$(echo "$response" | jq -r '.active')
    pending=$(echo "$response" | jq -r '.pending')
    paused=$(echo "$response" | jq -r '.paused')
    killed=$(echo "$response" | jq -r '.killed')
    stale=$(echo "$response" | jq -r '.stale | length')

    echo -e "  ${GREEN}●${NC} Active:  ${BOLD}${active}${NC}"
    echo -e "  ${YELLOW}●${NC} Pending: ${BOLD}${pending}${NC}"
    echo -e "  ${DIM}●${NC} Paused:  ${BOLD}${paused}${NC}"
    echo -e "  ${RED}●${NC} Killed:  ${BOLD}${killed}${NC}"
    echo ""

    if [ "$stale" -gt 0 ]; then
      echo -e "  ${RED}${BOLD}Stale agents:${NC}"
      echo "$response" | jq -r '.stale[]' | while read -r line; do
        echo -e "    ${RED}⚠${NC} ${line}"
      done
      echo ""
    fi

    local alerts
    alerts=$(echo "$response" | jq -r '.budgetAlerts | length')
    if [ "$alerts" -gt 0 ]; then
      echo -e "  ${YELLOW}${BOLD}Budget alerts:${NC}"
      echo "$response" | jq -r '.budgetAlerts[] | "    \(.name): \(.percentUsed | floor)% (\(.status))"' 2>/dev/null
      echo ""
    fi
  else
    echo "$response" | pretty
  fi
}

cmd_agents() {
  header "Agent Fleet"
  local response
  response=$(curl -sf "${ORACLE_URL}/fleet" 2>&1) || error "Failed to reach Oracle"

  if has_jq; then
    echo -e "  ${DIM}Total:${NC} $(echo "$response" | jq -r '.total') agents\n"
    echo "$response" | pretty
  else
    echo "$response" | pretty
  fi
}

cmd_approve() {
  [ -z "${1:-}" ] && error "Usage: oracle approve <agentId>"
  header "Approving agent ${1}"
  curl -sf -X POST "${ORACLE_URL}/agents/${1}/approve" | pretty
  echo -e "\n  ${GREEN}✓${NC} Agent approved"
}

cmd_reject() {
  [ -z "${1:-}" ] && error "Usage: oracle reject <agentId>"
  header "Rejecting agent ${1}"
  curl -sf -X POST "${ORACLE_URL}/agents/${1}/reject" | pretty
  echo -e "\n  ${RED}✗${NC} Agent rejected"
}

cmd_pause() {
  [ -z "${1:-}" ] && error "Usage: oracle pause <agentId>"
  header "Pausing agent ${1}"
  curl -sf -X POST "${ORACLE_URL}/agents/${1}/pause" | pretty
  echo -e "\n  ${YELLOW}⏸${NC} Agent paused"
}

cmd_kill() {
  [ -z "${1:-}" ] && error "Usage: oracle kill <agentId>"
  header "Killing agent ${1}"
  curl -sf -X POST "${ORACLE_URL}/agents/${1}/kill" | pretty
  echo -e "\n  ${RED}☠${NC} Agent killed"
}

cmd_run() {
  [ -z "${1:-}" ] && error "Usage: oracle run <agentId>"
  header "Running agent ${1}"
  curl -sf -X POST "${ORACLE_URL}/agents/${1}/run" | pretty
  echo -e "\n  ${GREEN}▶${NC} Agent triggered"
}

cmd_improve() {
  header "Running Improvement Cycle"
  echo -e "  ${DIM}This may take a moment...${NC}\n"
  curl -sf -X POST "${ORACLE_URL}/cron/improvement" | pretty
}

cmd_lead() {
  [ -z "${1:-}" ] && error "Usage: oracle lead \"Met Sarah at Sass Café, she runs a hotel...\""
  header "Processing lead"

  local response
  response=$(curl -sf -X POST "${ORACLE_URL}/lead" \
    -H "Authorization: Bearer ${LEAD_API_KEY:-}" \
    -H "Content-Type: application/json" \
    -d "{\"brief\": \"$*\"}" 2>&1) || error "Lead processing failed — is Oracle running?"

  if has_jq; then
    local status name biz email
    status=$(echo "$response" | jq -r '.status')
    name=$(echo "$response" | jq -r '.lead.prospectName')
    biz=$(echo "$response" | jq -r '.lead.businessName')
    email=$(echo "$response" | jq -r '.lead.prospectEmail // "not provided"')

    if [ "$status" = "sent" ]; then
      echo -e "  ${GREEN}✓${NC} Email sent to ${BOLD}${name}${NC} (${biz})"
      echo -e "  ${DIM}Email:${NC} $(echo "$response" | jq -r '.emailSentTo')"
    elif [ "$status" = "need_email" ]; then
      local lid
      lid=$(echo "$response" | jq -r '.leadId')
      echo -e "  ${YELLOW}⏳${NC} Lead captured: ${BOLD}${name}${NC} (${biz})"
      echo -e "  ${YELLOW}No email found.${NC} Provide it with:"
      echo -e "    ${GREEN}./oracle/cli.sh lead-email ${lid} their@email.com${NC}"
    else
      echo "$response" | pretty
    fi
  else
    echo "$response" | pretty
  fi
}

cmd_lead_email() {
  [ -z "${1:-}" ] || [ -z "${2:-}" ] && error "Usage: oracle lead-email <leadId> <email>"
  header "Sending to ${2}"
  local response
  response=$(curl -sf -X POST "${ORACLE_URL}/lead/email" \
    -H "Authorization: Bearer ${LEAD_API_KEY:-}" \
    -H "Content-Type: application/json" \
    -d "{\"leadId\": \"${1}\", \"email\": \"${2}\"}" 2>&1) || error "Failed"

  if has_jq; then
    echo -e "  ${GREEN}✓${NC} Email sent to ${BOLD}${2}${NC}"
  else
    echo "$response" | pretty
  fi
}

cmd_import() {
  [ -z "${1:-}" ] && error "Usage: oracle import <manifest.json>"
  [ ! -f "${1}" ] && error "File not found: ${1}"
  header "Importing agents from ${1}"

  local agent_count
  if has_jq; then
    agent_count=$(jq '.agents | length' "${1}")
    local client_name
    client_name=$(jq -r '.client.businessName' "${1}")
    echo -e "  ${DIM}Client:${NC} ${client_name}"
    echo -e "  ${DIM}Agents:${NC} ${agent_count}"
    echo ""
  fi

  local response
  response=$(curl -sf -X POST "${ORACLE_URL}/import" \
    -H "Content-Type: application/json" \
    -d @"${1}" 2>&1) || error "Import failed — is Oracle running at ${ORACLE_URL}?"

  if has_jq; then
    local scaffolded failed
    scaffolded=$(echo "$response" | jq '[.agents[] | select(.status == "scaffolded")] | length')
    failed=$(echo "$response" | jq '[.agents[] | select(.status == "failed")] | length')
    local creds
    creds=$(echo "$response" | jq '.credentials')

    echo -e "  ${GREEN}✓${NC} Scaffolded: ${BOLD}${scaffolded}${NC}"
    [ "$failed" -gt 0 ] && echo -e "  ${RED}✗${NC} Failed:     ${BOLD}${failed}${NC}"
    echo -e "  ${CYAN}🔑${NC} Credentials: ${BOLD}${creds}${NC}"
    echo ""

    echo -e "  ${BOLD}Agents:${NC}"
    echo "$response" | jq -r '.agents[] | "    \(if .status == "scaffolded" then "✓" else "✗" end) \(.name) (\(.agentType)) → \(.email)\(if .error then " — " + .error else "" end)"' 2>/dev/null
    echo ""

    local client_id
    client_id=$(echo "$response" | jq -r '.clientId')
    echo -e "  ${DIM}Client ID:${NC} ${client_id}"
    echo -e ""
    echo -e "  ${YELLOW}Next:${NC} Approve agents with ${GREEN}./oracle/cli.sh approve <agentId>${NC}"
  else
    echo "$response" | pretty
  fi
}

cmd_tools() {
  header "Tool Catalog"
  curl -sf "${ORACLE_URL}/tools/catalog" | pretty
}

cmd_tools_status() {
  [ -z "${1:-}" ] && error "Usage: oracle tools-status <clientId>"
  header "Tool Status for ${1}"
  curl -sf "${ORACLE_URL}/tools/status/${1}" | pretty
}

cmd_help() {
  echo -e "${BOLD}${CYAN}⚡ Oracle CLI${NC} — Ambitt Agents fleet control\n"
  echo -e "  ${BOLD}Usage:${NC} ./oracle/cli.sh <command> [args]\n"
  echo -e "  ${BOLD}Commands:${NC}"
  echo -e "    ${GREEN}health${NC}              Fleet health check"
  echo -e "    ${GREEN}agents${NC}              List all agents"
  echo -e "    ${GREEN}approve${NC} <id>        Approve a pending agent"
  echo -e "    ${GREEN}reject${NC} <id>         Reject a pending agent"
  echo -e "    ${YELLOW}pause${NC} <id>          Pause an active agent"
  echo -e "    ${RED}kill${NC} <id>            Kill an agent"
  echo -e "    ${BLUE}run${NC} <id>             Manually run an agent"
  echo -e "    ${PURPLE}improve${NC}             Run improvement cycle"
  echo -e "    ${BOLD}lead${NC} \"brief\"         Capture a lead from a bar conversation"
  echo -e "    ${BOLD}lead-email${NC} <id> <e>   Provide email for a pending lead"
  echo -e "    ${BOLD}import${NC} <file>        Bulk import agents from manifest JSON"
  echo -e "    ${CYAN}tools${NC}               List tool catalog"
  echo -e "    ${CYAN}tools-status${NC} <cid>   Tool status for client"
  echo -e ""
  echo -e "  ${BOLD}Environment:${NC}"
  echo -e "    ORACLE_URL=${DIM}${ORACLE_URL}${NC}"
  echo ""
}

# Route command
case "${1:-help}" in
  health)       cmd_health ;;
  agents)       cmd_agents ;;
  approve)      cmd_approve "${2:-}" ;;
  reject)       cmd_reject "${2:-}" ;;
  pause)        cmd_pause "${2:-}" ;;
  kill)         cmd_kill "${2:-}" ;;
  run)          cmd_run "${2:-}" ;;
  improve)      cmd_improve ;;
  lead)          shift; cmd_lead "$@" ;;
  lead-email)    cmd_lead_email "${2:-}" "${3:-}" ;;
  import)        cmd_import "${2:-}" ;;
  tools)        cmd_tools ;;
  tools-status) cmd_tools_status "${2:-}" ;;
  help|--help|-h) cmd_help ;;
  *)            error "Unknown command: ${1}. Run './oracle/cli.sh help' for usage." ;;
esac
