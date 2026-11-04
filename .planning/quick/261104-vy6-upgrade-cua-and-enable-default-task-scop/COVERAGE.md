# Cua Driver 0.38.0 capability coverage

Windows actual tools/list: 63 tools. Ordinary managed MCP: 39 GUI tools. Other OS native surfaces remain conditional on actual discovery; no native parity claim. Autopilot uses the separate bounded seven-tool adapter.

| Capability | Decision | Reason |
|---|---|---|
| bring_to_front | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| browser_click | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| browser_dialog | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| browser_download | OPT-OUT | Native debugging outside default GUI work |
| browser_navigate | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| browser_pointer | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| browser_prepare | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| browser_select | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| browser_set_input_files | OPT-OUT | Native debugging outside default GUI work |
| browser_type | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| check_for_update | OPT-OUT | Runtime installation and configuration use reviewed CLI operations |
| check_permissions | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| click | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| clipboard_read | OPT-OUT | Clipboard requires separate data-transfer authority |
| clipboard_write | OPT-OUT | Clipboard requires separate data-transfer authority |
| debug_window_info | OPT-OUT | Native debugging outside default GUI work |
| double_click | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| drag | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| end_session | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| escalate_session | OPT-OUT | Deprecated capture-scope compatibility tool; use explicit window targets |
| get_accessibility_tree | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| get_agent_cursor_state | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| get_browser_state | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| get_config | OPT-OUT | Runtime installation and configuration use reviewed CLI operations |
| get_cursor_position | OPT-OUT | Desktop-wide context is outside the default exact-window surface |
| get_desktop_state | OPT-OUT | Desktop-wide context is outside the default exact-window surface |
| get_guide | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| get_recording_state | OPT-OUT | Recording is outside ordinary task-scoped state observation |
| get_screen_size | OPT-OUT | Desktop-wide context is outside the default exact-window surface |
| get_session | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| get_session_state | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| get_window_state | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| health_report | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| hotkey | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| install_extension | OPT-OUT | Runtime installation and configuration use reviewed CLI operations |
| install_ffmpeg | OPT-OUT | Runtime installation and configuration use reviewed CLI operations |
| invoke_menu | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| kill_app | OPT-OUT | Close user applications through normal UI with task authority |
| launch_app | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| list_apps | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| list_sessions | OPT-OUT | Cross-task session discovery is outside this task |
| list_windows | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| move_cursor | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| page | OPT-OUT | Raw execution and replay are outside the managed GUI tool surface |
| parse_visual_regions | OPT-OUT | Separately licensed optional perception is disabled |
| press_key | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| replay_trajectory | OPT-OUT | Raw execution and replay are outside the managed GUI tool surface |
| right_click | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| run_script | OPT-OUT | Raw execution and replay are outside the managed GUI tool surface |
| run_steps | OPT-OUT | Raw execution and replay are outside the managed GUI tool surface |
| scroll | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| set_agent_cursor_enabled | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| set_agent_cursor_motion | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| set_agent_cursor_theme | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| set_config | OPT-OUT | Runtime installation and configuration use reviewed CLI operations |
| set_value | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| set_window_frame | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| start_recording | OPT-OUT | Recording is outside ordinary task-scoped state observation |
| start_session | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| stop_recording | OPT-OUT | Recording is outside ordinary task-scoped state observation |
| type_text | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| verify_state | INTEGRATE | Native standard permissions and task-scoped GUI authority |
| zoom | INTEGRATE | Native standard permissions and task-scoped GUI authority |
