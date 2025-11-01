#!/bin/bash

set -e

usage() {
    echo "Usage: $0 [-t title] [-d description] [-b target_branch] [-r reviewer] [-a assignee] [-l label] [--draft] [--push] [--help]"
    echo ""
    echo "Create a GitLab merge request with custom title and description."
    echo "The script will automatically determine source branch from current git branch."
    echo ""
    echo "Options:"
    echo "  -t, --title TITLE           Title for the merge request (required)"
    echo "  -d, --description DESC      Description for the merge request (required)"
    echo "  -b, --target-branch BRANCH  Target branch (default: main)"
    echo "  -r, --reviewer USER         Reviewer username"
    echo "  -a, --assignee USER         Assignee username"
    echo "  -l, --label LABEL           Label to add (can be used multiple times)"
    echo "  --draft                     Create as draft merge request"
    echo "  --push                      Push changes before creating MR"
    echo "  --help                      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -t \"Fix login bug\" -d \"Resolves issue with user authentication\""
    echo "  $0 -t \"Add new feature\" -d \"Implements user dashboard\" -b develop --draft"
    echo "  $0 -t \"Update docs\" -d \"Updates API documentation\" -r johndoe -a janedoe"
}

# Initialize variables
TITLE=""
DESCRIPTION=""
TARGET_BRANCH="main"
REVIEWER=""
ASSIGNEE=""
LABELS=()
DRAFT_FLAG=""
PUSH_FLAG=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--title)
            TITLE="$2"
            shift 2
            ;;
        -d|--description)
            DESCRIPTION="$2"
            shift 2
            ;;
        -b|--target-branch)
            TARGET_BRANCH="$2"
            shift 2
            ;;
        -r|--reviewer)
            REVIEWER="$2"
            shift 2
            ;;
        -a|--assignee)
            ASSIGNEE="$2"
            shift 2
            ;;
        -l|--label)
            LABELS+=("$2")
            shift 2
            ;;
        --draft)
            DRAFT_FLAG="--draft"
            shift
            ;;
        --push)
            PUSH_FLAG="--push"
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not in a git repository"
    exit 1
fi

# Check for required parameters
if [[ -z "$TITLE" ]]; then
    echo "Error: Title is required (-t or --title)"
    usage
    exit 1
fi

if [[ -z "$DESCRIPTION" ]]; then
    echo "Error: Description is required (-d or --description)"
    usage
    exit 1
fi

# Get current branch name
CURRENT_BRANCH=$(git branch --show-current)
if [[ -z "$CURRENT_BRANCH" ]]; then
    echo "Error: Could not determine current branch"
    exit 1
fi

echo "Creating merge request..."
echo "Source branch: $CURRENT_BRANCH"
echo "Target branch: $TARGET_BRANCH"
echo "Title: $TITLE"
echo "Description: $DESCRIPTION"

# Build glab command
GLAB_CMD="glab mr create -t \"$TITLE\" -d \"$DESCRIPTION\" -s \"$CURRENT_BRANCH\" -b \"$TARGET_BRANCH\""

# Add optional flags
if [[ -n "$REVIEWER" ]]; then
    GLAB_CMD="$GLAB_CMD --reviewer \"$REVIEWER\""
fi

if [[ -n "$ASSIGNEE" ]]; then
    GLAB_CMD="$GLAB_CMD --assignee \"$ASSIGNEE\""
fi

if [[ ${#LABELS[@]} -gt 0 ]]; then
    LABEL_STRING=$(IFS=,; echo "${LABELS[*]}")
    GLAB_CMD="$GLAB_CMD --label \"$LABEL_STRING\""
fi

if [[ -n "$DRAFT_FLAG" ]]; then
    GLAB_CMD="$GLAB_CMD $DRAFT_FLAG"
fi

if [[ -n "$PUSH_FLAG" ]]; then
    GLAB_CMD="$GLAB_CMD $PUSH_FLAG"
fi

# Execute the command
echo "Executing: $GLAB_CMD"
eval $GLAB_CMD

echo "Merge request created successfully!"