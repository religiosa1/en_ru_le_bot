//! Telegram MarkdownV2 helpers.

use teloxide::types::User;

/// Every special MarkdownV2 char.
const SPECIAL_CHARS: &str = "_*[]()~`>#+-=|{}.!\\";
/// Special chars, except for formatting ones (`*`, `_`, `~`, `|` and backticks), which templates can use.
const TEMPLATE_SPECIAL_CHARS: &str = "[]()>#+-={}.!\\";

/// Escapes a value, so it's displayed as is.
pub fn escape(value: &str) -> String {
    escape_chars(value, SPECIAL_CHARS)
}

/// Fills `{}` placeholders of a template with already valid Markdown values.
///
/// The template is escaped as well, except for formatting chars.
pub fn fill(template: &str, values: &[&str]) -> String {
    let mut result = String::new();
    for (i, part) in template.split("{}").enumerate() {
        if i > 0 {
            result += values[i - 1];
        }
        result += &escape_chars(part, TEMPLATE_SPECIAL_CHARS);
    }
    result
}

/// Mention of a user, working with or without a username.
pub fn mention(user: &User) -> String {
    let name = user.username.as_deref().unwrap_or(&user.first_name);
    format!("[@{}](tg://user?id={})", escape(name), user.id)
}

fn escape_chars(text: &str, special: &str) -> String {
    let mut result = String::with_capacity(text.len());
    for c in text.chars() {
        if special.contains(c) {
            result.push('\\');
        }
        result.push(c);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_values() {
        assert_eq!(escape("john.doe!"), "john\\.doe\\!");
        assert_eq!(escape("*bold* _italic_ ~strike~ |spoiler|"), "\\*bold\\* \\_italic\\_ \\~strike\\~ \\|spoiler\\|");
        assert_eq!(escape("3 + 4"), "3 \\+ 4");
    }

    #[test]
    fn escapes_templates_except_formatting() {
        assert_eq!(fill("Hi!", &[]), "Hi\\!");
        assert_eq!(fill("[link](url) # > - = {code} Back\\slash", &[]), "\\[link\\]\\(url\\) \\# \\> \\- \\= \\{code\\} Back\\\\slash");
        assert_eq!(fill("*bold* _italic_ ~strike~ |spoiler|", &[]), "*bold* _italic_ ~strike~ |spoiler|");
    }

    #[test]
    fn fills_values_as_is() {
        assert_eq!(fill("Hello {}! You have {} messages.", &["world", "5"]), "Hello world\\! You have 5 messages\\.");
        assert_eq!(fill("Click {} here", &["[link](url)"]), "Click [link](url) here");
        assert_eq!(fill("", &[]), "");
    }
}
